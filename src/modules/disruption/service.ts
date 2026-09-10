import { and, asc, desc, eq, gt, inArray, isNull, sql as raw } from "drizzle-orm";
import { db } from "../../db/client.js";
import * as t from "../../db/schema.js";
import { book } from "../bookings/service.js";
import { channel } from "../../channels/index.js";
import { firstRefusalExpiry } from "../../domain/fairness.js";
import { IST_OFFSET } from "../../domain/capacity.js";
import { audit } from "../../lib/audit.js";
import { notFound, unprocessable } from "../../http/errors.js";

const ACTIVE = ["booked"] as const; // only not-yet-arrived bookings are re-planned

const fmtDate = (d: string) =>
  new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(new Date(`${d}T12:00:00${IST_OFFSET}`));
const fmtWindow = (s: Date, e: Date) => {
  const f = (d: Date) => new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(d);
  return `${f(s)}–${f(e)}`;
};

/**
 * A centre event (rain, a full godown, a bag shortage) collapses the day. The deck's
 * answer: automatic reschedule with a 6-hour first refusal, absorbed by the reserve.
 *
 * For each not-yet-arrived booking we: free its capacity, find the earliest open
 * slot on a later day, HOLD that capacity for the farmer for 6 hours, and send a
 * reply-by-digit offer. Nothing is auto-confirmed — the farmer replies "1".
 */
export async function declareEvent(input: {
  operatorId: string;
  centreId: string;
  date: string;
  kind: "rain" | "godown_full" | "bag_shortage" | "weighbridge_down" | "holiday";
  note?: string;
}): Promise<{ event: string; offersMade: number }> {
  const [event] = await db.insert(t.centreEvents).values({
    centreId: input.centreId, date: input.date, kind: input.kind, note: input.note ?? null, createdBy: input.operatorId,
  }).returning();

  // Pause the day so nothing new books into it.
  await db.update(t.centreDays).set({ status: "paused" })
    .where(and(eq(t.centreDays.centreId, input.centreId), eq(t.centreDays.date, input.date)));

  const affected = await db.select().from(t.bookings)
    .where(and(eq(t.bookings.centreId, input.centreId), eq(t.bookings.date, input.date), inArray(t.bookings.status, ACTIVE)));

  // Candidate replacement slots: open, future, same centre, with room — earliest first.
  const replacements = await db
    .select({ slot: t.slots, day: t.centreDays })
    .from(t.slots)
    .innerJoin(t.centreDays, eq(t.centreDays.id, t.slots.centreDayId))
    .where(and(eq(t.centreDays.centreId, input.centreId), eq(t.centreDays.status, "open"), gt(t.centreDays.date, input.date)))
    .orderBy(asc(t.slots.windowStart));

  let offersMade = 0;
  for (const b of affected) {
    // Free the original booking's capacity.
    await releaseBooking(b);

    // Pick the earliest replacement slot that still has room after existing holds.
    const target = await firstWithRoom(replacements, b.trolleys);
    if (!target) continue; // nothing to offer; farmer keeps a cancelled booking + a call to action

    // Hold the capacity for 6 hours — the first-refusal window.
    await db.insert(t.slotHolds).values({
      slotId: target.slot.id, userId: b.userId, trolleys: b.trolleys, qtl: b.qtlDeclared,
      reason: `${input.kind}_reschedule`, expiresAt: firstRefusalExpiry(),
    });

    await db.insert(t.pendingDecisions).values({
      userId: b.userId,
      kind: "reschedule_offer",
      payload: {
        originalRef: b.ref, slotId: target.slot.id, date: target.day.date,
        window: fmtWindow(target.slot.windowStart, target.slot.windowEnd), qtl: Number(b.qtlDeclared), crop: b.crop,
      },
      expiresAt: firstRefusalExpiry(),
    });

    const [centre] = await db.select().from(t.centres).where(eq(t.centres.id, input.centreId)).limit(1);
    const [user] = await db.select().from(t.users).where(eq(t.users.id, b.userId)).limit(1);
    await channel().send({
      userId: b.userId, to: user!.mobile, templateId: "reschedule_offer", language: user!.language,
      vars: { centre: centre!.name, reason: input.kind.replace("_", " "), date: fmtDate(target.day.date), window: fmtWindow(target.slot.windowStart, target.slot.windowEnd) },
    });
    offersMade++;
  }

  await audit({ actorId: input.operatorId, action: "centre.event", entity: "centre_event", entityId: event!.id, after: { kind: input.kind, offersMade } });
  return { event: event!.id, offersMade };
}

async function releaseBooking(b: typeof t.bookings.$inferSelect) {
  await db.transaction(async (tx) => {
    await tx.update(t.bookings).set({ status: "cancelled", cancelledAt: new Date() }).where(eq(t.bookings.id, b.id));
    const [slot] = await tx.select().from(t.slots).where(eq(t.slots.id, b.slotId)).limit(1);
    if (slot) {
      await tx.update(t.slots).set({
        bookedTrolleys: Math.max(0, slot.bookedTrolleys - b.trolleys),
        bookedQtl: String(Math.max(0, Number(slot.bookedQtl) - Number(b.qtlDeclared))),
      }).where(eq(t.slots.id, slot.id));
      const [day] = await tx.select().from(t.centreDays).where(eq(t.centreDays.id, slot.centreDayId)).limit(1);
      if (day) await tx.update(t.centreDays).set({
        bookedTrolleys: Math.max(0, day.bookedTrolleys - b.trolleys),
        bookedQtl: String(Math.max(0, Number(day.bookedQtl) - Number(b.qtlDeclared))),
      }).where(eq(t.centreDays.id, day.id));
    }
    const [holding] = await tx.select().from(t.holdings).where(eq(t.holdings.userId, b.userId)).limit(1);
    if (holding) await tx.update(t.holdings)
      .set({ usedQtl: String(Math.max(0, Number(holding.usedQtl) - Number(b.qtlDeclared))) })
      .where(eq(t.holdings.id, holding.id));
  });
}

async function firstWithRoom(
  replacements: { slot: typeof t.slots.$inferSelect; day: typeof t.centreDays.$inferSelect }[],
  trolleys: number,
) {
  for (const r of replacements) {
    const [heldRow] = await db
      .select({ held: raw<number>`coalesce(sum(${t.slotHolds.trolleys}),0)::int` })
      .from(t.slotHolds)
      .where(and(eq(t.slotHolds.slotId, r.slot.id), isNull(t.slotHolds.claimedAt), isNull(t.slotHolds.releasedAt), gt(t.slotHolds.expiresAt, new Date())));
    if (r.slot.bookedTrolleys + (heldRow?.held ?? 0) + trolleys <= r.slot.capacityTrolleys) return r;
  }
  return null;
}

/**
 * "Reply 1 to accept." Resolves the farmer's latest open reschedule offer by
 * booking the held slot — the same locked, capacity-checked path as any booking,
 * except the farmer's own hold lets them take the reserved seat.
 */
export async function acceptLatestOffer(userId: string, via: "sms" | "ivr" | "app" = "sms") {
  const [decision] = await db.select().from(t.pendingDecisions)
    .where(and(eq(t.pendingDecisions.userId, userId), eq(t.pendingDecisions.kind, "reschedule_offer"), isNull(t.pendingDecisions.resolvedAt), gt(t.pendingDecisions.expiresAt, new Date())))
    .orderBy(desc(t.pendingDecisions.createdAt))
    .limit(1);
  if (!decision) throw notFound("Offer");

  const payload = decision.payload as { slotId: string; qtl: number; crop: string; originalRef: string };
  const result = await book({ userId, slotId: payload.slotId, qtl: payload.qtl, crop: payload.crop, bookedVia: via });

  await db.update(t.pendingDecisions).set({ resolvedAt: new Date(), resolvedBy: via }).where(eq(t.pendingDecisions.id, decision.id));
  await audit({ actorId: userId, action: "reschedule.accept", entity: "booking", entityId: result.booking.ref, after: { via, from: payload.originalRef } });
  return result;
}

/** Find a user by mobile for the inbound SMS/IVR webhooks. */
export async function userByMobile(mobile: string) {
  const [u] = await db.select().from(t.users).where(eq(t.users.mobile, mobile)).limit(1);
  if (!u) throw unprocessable("UNKNOWN_MOBILE", "This number is not registered.");
  return u;
}
