import { and, eq, inArray, lt, isNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import * as t from "../../db/schema.js";
import { applyNoShow, FAIRNESS_RULES } from "../../domain/fairness.js";
import { audit } from "../../lib/audit.js";

/**
 * The deck's "no-shows drain the slots" risk, answered: a booking whose window
 * closed more than the grace period ago, and who never checked in, is a no-show.
 * Its seat returns to the pool, and the farmer's priority score drops — a
 * published, reversible penalty, not a ban.
 */
export async function sweepNoShows(now = new Date()): Promise<{ swept: number }> {
  const cutoff = new Date(now.getTime() - FAIRNESS_RULES.noShowGraceMinutes * 60_000);

  // Bookings still 'booked' (never checked in) whose window closed before the cutoff.
  const stale = await db
    .select({ b: t.bookings, windowEnd: t.slots.windowEnd })
    .from(t.bookings)
    .innerJoin(t.slots, eq(t.slots.id, t.bookings.slotId))
    .where(and(eq(t.bookings.status, "booked"), lt(t.slots.windowEnd, cutoff)));

  let swept = 0;
  for (const { b } of stale) {
    await db.transaction(async (tx) => {
      await tx.update(t.bookings).set({ status: "no_show", noShowAt: now }).where(eq(t.bookings.id, b.id));

      // Return the seat and the quintals.
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

      // Lower the priority score and count the no-show.
      const [u] = await tx.select().from(t.users).where(eq(t.users.id, b.userId)).limit(1);
      if (u) await tx.update(t.users)
        .set({ priorityScore: applyNoShow(u.priorityScore), noShowCount: u.noShowCount + 1 })
        .where(eq(t.users.id, u.id));
    });
    await audit({ action: "booking.no_show", entity: "booking", entityId: b.id, after: { ref: b.ref } });
    swept++;
  }
  return { swept };
}

/** First-refusal holds only last 6 hours; release the expired ones so capacity reopens. */
export async function releaseExpiredHolds(now = new Date()): Promise<{ released: number }> {
  const expired = await db.select().from(t.slotHolds)
    .where(and(isNull(t.slotHolds.claimedAt), isNull(t.slotHolds.releasedAt), lt(t.slotHolds.expiresAt, now)));
  if (!expired.length) return { released: 0 };
  await db.update(t.slotHolds).set({ releasedAt: now })
    .where(inArray(t.slotHolds.id, expired.map((h) => h.id)));
  return { released: expired.length };
}

/** Expire unresolved pending decisions (reschedule offers) past their window. */
export async function expireDecisions(now = new Date()): Promise<{ expired: number }> {
  const rows = await db.update(t.pendingDecisions)
    .set({ resolvedAt: now, resolvedBy: "expired" })
    .where(and(isNull(t.pendingDecisions.resolvedAt), lt(t.pendingDecisions.expiresAt, now)))
    .returning({ id: t.pendingDecisions.id });
  return { expired: rows.length };
}

export async function runMaintenance(now = new Date()) {
  const [noShows, holds, decisions] = await Promise.all([sweepNoShows(now), releaseExpiredHolds(now), expireDecisions(now)]);
  return { ...noShows, ...holds, ...decisions };
}

