import { and, desc, eq, gt, inArray, isNull, sql as raw } from "drizzle-orm";
import { db } from "../../db/client.js";
import * as t from "../../db/schema.js";
import type { Pool } from "../../domain/fairness.js";
import { decideBooking, type SlotState, type FarmerState } from "../../domain/booking.js";
import { IST_OFFSET } from "../../domain/capacity.js";
import { channel } from "../../channels/index.js";
import { hashSecret, numericCode } from "../../lib/hash.js";
import { bookingRef } from "../../lib/ids.js";
import { env } from "../../env.js";
import { AppError, notFound, unprocessable, conflict, forbidden } from "../../http/errors.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Statuses that consume capacity. A cancelled or no-show booking frees its seat. */
const ACTIVE = ["booked", "checked_in", "served"] as const;

const fmtDate = (date: string) =>
  new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" })
    .format(new Date(`${date}T12:00:00${IST_OFFSET}`));

const fmtWindow = (start: Date, end: Date) => {
  const f = (d: Date) =>
    new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(d);
  return `${f(start)}–${f(end)}`;
};

/** Hours between now and the day's first window (08:00 IST). Drives pool release. */
function hoursUntilDay(date: string, now = new Date()): number {
  const dayStart = new Date(`${date}T08:00:00${IST_OFFSET}`);
  return (dayStart.getTime() - now.getTime()) / 3_600_000;
}

async function activeByPool(
  tx: Tx,
  slotId: string,
): Promise<{ total: number; byPool: Record<Pool, number> }> {
  const rows = await tx
    .select({ pool: t.bookings.pool, trolleys: raw<number>`coalesce(sum(${t.bookings.trolleys}),0)::int` })
    .from(t.bookings)
    .where(and(eq(t.bookings.slotId, slotId), inArray(t.bookings.status, ACTIVE)))
    .groupBy(t.bookings.pool);

  const byPool: Record<Pool, number> = { general: 0, reserve: 0, small_holder: 0 };
  let total = 0;
  for (const r of rows) {
    byPool[r.pool as Pool] = r.trolleys;
    total += r.trolleys;
  }
  return { total, byPool };
}

export interface BookInput {
  userId: string;
  slotId: string;
  qtl: number;
  crop?: string;
  trolleys?: number;
  bookedVia?: string;
  bookedByUserId?: string | null;
}

export interface BookResult {
  booking: PublicBooking;
  gateOtp?: string; // dev only; production delivers it by SMS
}

export interface PublicBooking {
  ref: string;
  centreId: string;
  centre: string;
  date: string;
  dateLabel: string;
  window: string;
  slot: string;
  slotEnd: string;
  crop: string;
  qtl: number;
  pool: string;
  status: string;
}

/**
 * Books a slot inside one transaction that holds a row lock on the centre-day.
 *
 * The lock is the whole design. Two farmers racing for the last seat both reach
 * the SELECT ... FOR UPDATE; the second waits for the first to COMMIT, then reads
 * the counter the first just wrote, sees the slot is full, and is refused. No
 * overselling is possible, and no application-level locking is involved.
 */
export async function book(input: BookInput): Promise<BookResult> {
  const gateOtp = numericCode(4);

  const { booking, centreName, window } = await db.transaction(async (tx) => {
    // Find the slot, then lock its centre-day. Everything after this is serialised
    // per centre-day, which is the correct granularity: different days never contend.
    const [slot] = await tx.select().from(t.slots).where(eq(t.slots.id, input.slotId)).limit(1);
    if (!slot) throw notFound("Slot");

    const [day] = await tx
      .select()
      .from(t.centreDays)
      .where(eq(t.centreDays.id, slot.centreDayId))
      .for("update")
      .limit(1);
    if (!day) throw notFound("Centre day");
    if (day.status !== "open") {
      throw conflict("CENTRE_CLOSED", "This centre is not taking bookings for that day.").asCacheable();
    }

    // Re-read the slot now that we hold the lock, so counters are authoritative.
    const [lockedSlot] = await tx.select().from(t.slots).where(eq(t.slots.id, slot.id)).limit(1);
    const { total, byPool } = await activeByPool(tx, slot.id);

    const [holding] = await tx.select().from(t.holdings).where(eq(t.holdings.userId, input.userId)).limit(1);
    if (!holding) {
      throw unprocessable("NO_HOLDING", "Your land record is not linked yet. Ask for help at your panchayat.");
    }

    const released =
      day.poolsReleasedAt != null || hoursUntilDay(day.date) <= 24;

    // First-refusal holds (rain reschedule etc.): another farmer's unexpired hold
    // reserves capacity, so it counts as booked to everyone but its owner. The
    // owner's own hold grants them the reserve pool.
    const holds = await tx.select().from(t.slotHolds)
      .where(and(eq(t.slotHolds.slotId, slot.id), isNull(t.slotHolds.claimedAt), isNull(t.slotHolds.releasedAt), gt(t.slotHolds.expiresAt, new Date())));
    const heldByOthers = holds.filter((h) => h.userId !== input.userId).reduce((n, h) => n + h.trolleys, 0);
    const myHold = holds.find((h) => h.userId === input.userId) ?? null;

    const slotState: SlotState = {
      capacityTrolleys: lockedSlot!.capacityTrolleys,
      bookedTrolleys: total + heldByOthers,
      bookedByPool: byPool,
      released,
    };
    const farmerState: FarmerState = {
      areaHa: Number(holding.areaHa),
      entitlementQtl: Number(holding.entitlementQtl),
      usedQtl: Number(holding.usedQtl),
      hasHold: myHold != null, // an unexpired first-refusal claim on this slot
      hoursUntilDay: hoursUntilDay(day.date),
    };
    const trolleys = input.trolleys ?? 1;

    const decision = decideBooking(farmerState, slotState, { qtl: input.qtl, trolleys });
    if (!decision.ok) {
      // Deterministic refusals are cacheable: a double-tap gets the same SLOT_FULL,
      // not a second attempt that might now succeed against a freed seat.
      throw new AppError(decision.code === "SLOT_FULL" ? 409 : 422, decision.code, decision.message, decision.details).asCacheable();
    }

    const [created] = await tx
      .insert(t.bookings)
      .values({
        ref: bookingRef(),
        userId: input.userId,
        slotId: slot.id,
        centreId: day.centreId,
        date: day.date,
        crop: input.crop ?? holding.crop,
        qtlDeclared: String(input.qtl),
        trolleys,
        pool: decision.pool,
        gateOtpHash: hashSecret(gateOtp),
        bookedVia: input.bookedVia ?? "app",
        bookedByUserId: input.bookedByUserId ?? null,
      })
      .returning();

    // Denormalised counters — the fast path for availability reads. The lock makes
    // these safe to increment without re-reading.
    await tx
      .update(t.slots)
      .set({
        bookedTrolleys: lockedSlot!.bookedTrolleys + trolleys,
        bookedQtl: String(Number(lockedSlot!.bookedQtl) + input.qtl),
      })
      .where(eq(t.slots.id, slot.id));
    await tx
      .update(t.centreDays)
      .set({
        bookedTrolleys: day.bookedTrolleys + trolleys,
        bookedQtl: String(Number(day.bookedQtl) + input.qtl),
      })
      .where(eq(t.centreDays.id, day.id));

    // Entitlement is consumed here and released on cancel — this is what makes the
    // land-record cap hold across a whole season, not just one booking.
    await tx
      .update(t.holdings)
      .set({ usedQtl: String(Number(holding.usedQtl) + input.qtl) })
      .where(eq(t.holdings.id, holding.id));

    if (myHold) {
      await tx.update(t.slotHolds).set({ claimedAt: new Date() }).where(eq(t.slotHolds.id, myHold.id));
    }

    const [centre] = await tx.select().from(t.centres).where(eq(t.centres.id, day.centreId)).limit(1);

    return {
      booking: created!,
      centreName: centre!.name,
      window: { start: lockedSlot!.windowStart, end: lockedSlot!.windowEnd },
    };
  });

  // Confirmation SMS is sent AFTER commit, never inside the transaction: a slow
  // provider must not hold a row lock, and a booking that committed must not be
  // undone because a message failed.
  const [user] = await db.select().from(t.users).where(eq(t.users.id, input.userId)).limit(1);
  await channel().send({
    userId: input.userId,
    to: user!.mobile,
    templateId: "booking_confirmed",
    language: user!.language,
    vars: {
      centre: centreName,
      date: fmtDate(booking.date),
      window: fmtWindow(window.start, window.end),
      gateOtp,
    },
  });

  return {
    booking: toPublic(booking, centreName, window.start, window.end),
    ...(env.NODE_ENV !== "production" ? { gateOtp } : {}),
  };
}

function toPublic(b: typeof t.bookings.$inferSelect, centre: string, start: Date, end: Date): PublicBooking {
  const time = (d: Date) =>
    new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(d);
  return {
    ref: b.ref,
    centreId: b.centreId,
    centre,
    date: b.date,
    dateLabel: fmtDate(b.date),
    window: fmtWindow(start, end),
    slot: time(start),
    slotEnd: time(end),
    crop: b.crop,
    qtl: Number(b.qtlDeclared),
    pool: b.pool,
    status: b.status,
  };
}

/* --------------------------------------------------------------- cancel */

/** Cancels a booking and returns its capacity to the pool it came from. */
export async function cancel(userId: string, ref: string): Promise<{ message: string }> {
  await db.transaction(async (tx) => {
    const [booking] = await tx.select().from(t.bookings).where(eq(t.bookings.ref, ref)).limit(1);
    if (!booking) throw notFound("Booking");
    if (booking.userId !== userId) throw forbidden("This is not your booking.");
    if (!ACTIVE.includes(booking.status as (typeof ACTIVE)[number]) || booking.status === "served") {
      throw conflict("NOT_CANCELLABLE", "This booking can no longer be cancelled.");
    }

    // Lock the centre-day before touching counters, same as booking.
    const [day] = await tx.select().from(t.centreDays).where(eq(t.centreDays.id,
      raw`(select ${t.slots.centreDayId} from ${t.slots} where ${t.slots.id} = ${booking.slotId})`))
      .for("update").limit(1);

    await tx.update(t.bookings)
      .set({ status: "cancelled", cancelledAt: new Date() })
      .where(eq(t.bookings.id, booking.id));

    const [slot] = await tx.select().from(t.slots).where(eq(t.slots.id, booking.slotId)).limit(1);
    await tx.update(t.slots).set({
      bookedTrolleys: Math.max(0, slot!.bookedTrolleys - booking.trolleys),
      bookedQtl: String(Math.max(0, Number(slot!.bookedQtl) - Number(booking.qtlDeclared))),
    }).where(eq(t.slots.id, slot!.id));

    if (day) {
      await tx.update(t.centreDays).set({
        bookedTrolleys: Math.max(0, day.bookedTrolleys - booking.trolleys),
        bookedQtl: String(Math.max(0, Number(day.bookedQtl) - Number(booking.qtlDeclared))),
      }).where(eq(t.centreDays.id, day.id));
    }

    const [holding] = await tx.select().from(t.holdings).where(eq(t.holdings.userId, userId)).limit(1);
    if (holding) {
      await tx.update(t.holdings)
        .set({ usedQtl: String(Math.max(0, Number(holding.usedQtl) - Number(booking.qtlDeclared))) })
        .where(eq(t.holdings.id, holding.id));
    }
  });
  return { message: "Booking cancelled. Your entitlement has been returned." };
}

/**
 * Reschedule = cancel the old booking and book the new slot in one go. Both halves
 * run through the same locked, capacity-checked paths, so a reschedule can be
 * refused (new slot full) with the old booking left untouched.
 */
export async function reschedule(userId: string, ref: string, newSlotId: string): Promise<BookResult> {
  const [existing] = await db.select().from(t.bookings).where(eq(t.bookings.ref, ref)).limit(1);
  if (!existing) throw notFound("Booking");
  if (existing.userId !== userId) throw forbidden("This is not your booking.");
  if (existing.status !== "booked") throw conflict("NOT_RESCHEDULABLE", "Only an upcoming booking can be moved.");

  // Book the new slot first. If it is full, we throw before cancelling the old one —
  // the farmer never loses a confirmed slot to a failed move.
  const moved = await book({
    userId,
    slotId: newSlotId,
    qtl: Number(existing.qtlDeclared),
    crop: existing.crop,
    trolleys: existing.trolleys,
    bookedVia: existing.bookedVia,
  });
  await cancel(userId, ref);
  return moved;
}

export async function listBookings(userId: string): Promise<PublicBooking[]> {
  const rows = await db
    .select({ b: t.bookings, centre: t.centres.name, start: t.slots.windowStart, end: t.slots.windowEnd })
    .from(t.bookings)
    .innerJoin(t.centres, eq(t.centres.id, t.bookings.centreId))
    .innerJoin(t.slots, eq(t.slots.id, t.bookings.slotId))
    .where(eq(t.bookings.userId, userId))
    .orderBy(desc(t.bookings.createdAt));
  return rows.map((r) => toPublic(r.b, r.centre, r.start, r.end));
}
