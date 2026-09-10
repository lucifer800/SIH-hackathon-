import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import * as t from "../../db/schema.js";
import type { Lang } from "../../db/schema.js";
import { grievanceRef } from "../../lib/ids.js";
import { audit } from "../../lib/audit.js";
import { notFound, unprocessable, forbidden } from "../../http/errors.js";

/**
 * Grievances — the deck's governance promise: "every grievance tied to a lot ID".
 * A farmer raises a complaint against a specific receipt or booking, so a district
 * officer can trace it to the exact weighment, payment and operator behind it.
 */

const CATEGORIES = ["weighment", "payment", "slot", "quality", "other"] as const;
export type GrievanceCategory = (typeof CATEGORIES)[number];

export interface FileInput {
  userId: string;
  language: Lang;
  category: GrievanceCategory;
  body: string;
  receiptNo?: string;
  bookingRef?: string;
}

export async function fileGrievance(input: FileInput) {
  let lotId: string | null = null;
  let bookingId: string | null = null;

  // Tie it to a real lot/booking that belongs to this farmer.
  if (input.receiptNo) {
    const [lot] = await db.select().from(t.lots).where(and(eq(t.lots.receiptNo, input.receiptNo), eq(t.lots.userId, input.userId))).limit(1);
    if (!lot) throw unprocessable("UNKNOWN_RECEIPT", "That receipt is not one of yours.");
    lotId = lot.id;
    bookingId = lot.bookingId;
  } else if (input.bookingRef) {
    const [b] = await db.select().from(t.bookings).where(and(eq(t.bookings.ref, input.bookingRef), eq(t.bookings.userId, input.userId))).limit(1);
    if (!b) throw unprocessable("UNKNOWN_BOOKING", "That booking is not one of yours.");
    bookingId = b.id;
  }

  const [g] = await db.insert(t.grievances).values({
    ref: grievanceRef(), userId: input.userId, lotId, bookingId,
    category: input.category, body: input.body.trim(), language: input.language,
  }).returning();

  await audit({ actorId: input.userId, action: "grievance.file", entity: "grievance", entityId: g!.id, after: { ref: g!.ref, category: g!.category, lotId, bookingId } });
  return toView(g!);
}

export async function listMine(userId: string) {
  const rows = await db.select().from(t.grievances).where(eq(t.grievances.userId, userId)).orderBy(desc(t.grievances.createdAt));
  return rows.map(toView);
}

/** District/admin queue — open grievances first, each carrying its lot/booking link. */
export async function listForDistrict(status?: string) {
  const rows = await db.select().from(t.grievances)
    .where(status ? eq(t.grievances.status, status as "open") : undefined)
    .orderBy(desc(t.grievances.createdAt))
    .limit(200);
  return rows.map(toView);
}

export async function resolve(actorId: string, ref: string, resolution: string, reject = false) {
  const [g] = await db.select().from(t.grievances).where(eq(t.grievances.ref, ref)).limit(1);
  if (!g) throw notFound("Grievance");
  if (g.status === "resolved" || g.status === "rejected") throw forbidden("This grievance is already closed.");

  const [updated] = await db.update(t.grievances)
    .set({ status: reject ? "rejected" : "resolved", resolution: resolution.trim(), assignedTo: actorId, resolvedAt: new Date() })
    .where(eq(t.grievances.id, g.id)).returning();

  await audit({ actorId, action: reject ? "grievance.reject" : "grievance.resolve", entity: "grievance", entityId: g.id, before: { status: g.status }, after: { status: updated!.status } });
  return toView(updated!);
}

function toView(g: typeof t.grievances.$inferSelect) {
  return {
    ref: g.ref, category: g.category, body: g.body, status: g.status,
    lotId: g.lotId, bookingId: g.bookingId, resolution: g.resolution,
    createdAt: g.createdAt.toISOString(), resolvedAt: g.resolvedAt?.toISOString() ?? null,
  };
}

export { CATEGORIES };
