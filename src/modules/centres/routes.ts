import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, asc, eq, gte, inArray, lte, sql as raw } from "drizzle-orm";
import { db } from "../../db/client.js";
import * as t from "../../db/schema.js";
import { authenticate } from "../../http/auth.js";
import { haversineKm } from "../../lib/geo.js";
import { eligiblePools, type Pool } from "../../domain/fairness.js";
import { poolRemaining, type SlotState } from "../../domain/booking.js";
import { IST_OFFSET, istDate, addDays } from "../../domain/capacity.js";
import { notFound } from "../../http/errors.js";

const ACTIVE = ["booked", "checked_in", "served"] as const;

const hoursUntilDay = (date: string, now = new Date()) =>
  (new Date(`${date}T08:00:00${IST_OFFSET}`).getTime() - now.getTime()) / 3_600_000;

export async function centreRoutes(app: FastifyInstance) {
  /** Booking step 1: which centres, and how far. Distance needs the farmer's holding. */
  app.get("/api/v1/centres", { preHandler: [authenticate] }, async (request) => {
    const q = z.object({ district: z.string().optional(), crop: z.string().optional() }).parse(request.query);

    const rows = await db
      .select()
      .from(t.centres)
      .where(and(eq(t.centres.active, true), q.district ? eq(t.centres.district, q.district) : undefined));

    const [holding] = await db.select().from(t.holdings).where(eq(t.holdings.userId, request.auth!.userId)).limit(1);
    const from =
      holding?.lat && holding?.lng ? { lat: Number(holding.lat), lng: Number(holding.lng) } : null;

    const centres = rows
      .map((c) => ({
        id: c.id,
        name: c.name,
        location: `${c.name.replace(/ Procurement Centre$/, "")}, ${c.district}`,
        district: c.district,
        lanes: c.lanes,
        distanceKm: from ? haversineKm(from, { lat: Number(c.lat), lng: Number(c.lng) }) : null,
      }))
      .sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));

    return { centres };
  });

  /** Which dates are open at this centre, and how full each is. */
  app.get("/api/v1/centres/:id/days", { preHandler: [authenticate] }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const q = z
      .object({ from: z.string().optional(), to: z.string().optional() })
      .parse(request.query);
    const from = q.from ?? istDate();
    const to = q.to ?? addDays(from, 9);

    const days = await db
      .select()
      .from(t.centreDays)
      .where(and(eq(t.centreDays.centreId, id), gte(t.centreDays.date, from), lte(t.centreDays.date, to)))
      .orderBy(asc(t.centreDays.date));

    return {
      days: days.map((d) => ({
        date: d.date,
        capacityTrolleys: d.capacityTrolleys,
        bookedTrolleys: d.bookedTrolleys,
        remainingTrolleys: Math.max(0, d.capacityTrolleys - d.bookedTrolleys),
        status: d.status,
      })),
    };
  });

  /**
   * Booking step 3: real remaining capacity per 2-hour window, from THIS farmer's
   * point of view. A small holder sees the small-holder pool; a large holder does
   * not — the availability a farmer is shown is the availability they can actually
   * book, so the screen can never offer a seat the engine will refuse.
   */
  app.get("/api/v1/centres/:id/slots", { preHandler: [authenticate] }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const q = z.object({ date: z.string() }).parse(request.query);

    const [day] = await db
      .select()
      .from(t.centreDays)
      .where(and(eq(t.centreDays.centreId, id), eq(t.centreDays.date, q.date)))
      .limit(1);
    if (!day) throw notFound("Centre day");

    const slots = await db
      .select()
      .from(t.slots)
      .where(eq(t.slots.centreDayId, day.id))
      .orderBy(asc(t.slots.windowStart));

    // Per-slot, per-pool active trolleys in one grouped query.
    const counts = await db
      .select({
        slotId: t.bookings.slotId,
        pool: t.bookings.pool,
        trolleys: raw<number>`coalesce(sum(${t.bookings.trolleys}),0)::int`,
      })
      .from(t.bookings)
      .where(and(inArray(t.bookings.slotId, slots.map((s) => s.id)), inArray(t.bookings.status, ACTIVE)))
      .groupBy(t.bookings.slotId, t.bookings.pool);

    const byPool = new Map<string, Record<Pool, number>>();
    for (const s of slots) byPool.set(s.id, { general: 0, reserve: 0, small_holder: 0 });
    for (const c of counts) byPool.get(c.slotId)![c.pool as Pool] = c.trolleys;

    const [holding] = await db.select().from(t.holdings).where(eq(t.holdings.userId, request.auth!.userId)).limit(1);
    const areaHa = holding ? Number(holding.areaHa) : 999;
    const released = day.poolsReleasedAt != null || hoursUntilDay(day.date) <= 24;
    const pools = eligiblePools({ areaHa, hoursUntilDay: hoursUntilDay(day.date), hasHold: false });

    const time = (d: Date) =>
      new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(d);

    return {
      date: day.date,
      centreStatus: day.status,
      slots: slots.map((s) => {
        const active = byPool.get(s.id)!;
        const total = active.general + active.reserve + active.small_holder;
        const state: SlotState = {
          capacityTrolleys: s.capacityTrolleys,
          bookedTrolleys: total,
          bookedByPool: active,
          released,
        };
        // The remaining the farmer can actually take: the best of their eligible pools.
        const remaining = Math.max(0, ...pools.map((p) => poolRemaining(state, p)));
        return {
          id: s.id,
          time: time(s.windowStart),
          end: time(s.windowEnd),
          capacityTrolleys: s.capacityTrolleys,
          bookedTrolleys: total,
          remainingTrolleys: remaining,
          available: day.status === "open" && remaining > 0,
          pool: pools[0] ?? "general",
        };
      }),
    };
  });
}
