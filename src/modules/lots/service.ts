import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import * as t from "../../db/schema.js";
import { computeWeighment, WHEAT_MSP } from "../../domain/payments.js";
import { receiptNo } from "../../lib/ids.js";
import { audit } from "../../lib/audit.js";
import { notFound, unprocessable, conflict, forbidden } from "../../http/errors.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Latest loaded rate for a crop, else the MSP fallback (rate ingest is L5). */
async function rateFor(crop: string): Promise<number> {
  const [r] = await db
    .select({ modal: t.rates.modalPrice, msp: t.rates.msp })
    .from(t.rates)
    .where(eq(t.rates.crop, crop))
    .orderBy(desc(t.rates.date))
    .limit(1);
  return Number(r?.msp ?? r?.modal ?? WHEAT_MSP);
}

export interface RecordLotInput {
  operatorId: string;
  operatorRole: string;
  operatorCentreId: string | null;
  bookingRef: string;
  moisturePct: number;
  grossQtl: number;
  tareQtl: number;
  variety?: string;
  ratePerQtl?: number;
  normPct?: number;
}

export interface LotView {
  receiptNo: string;
  bookingRef: string;
  crop: string;
  variety: string | null;
  moisturePct: number;
  normPct: number;
  moistureOverNorm: boolean;
  grossQtl: number;
  tareQtl: number;
  netQtl: number;
  ratePerQtl: number;
  amount: number;
  weighedAt: string;
  payment: { status: string; failureReason: string | null };
}

/**
 * Records a weighment as an immutable lot and opens its payment as `pending`.
 * One lot per booking (a farmer is weighed once), enforced by a unique index —
 * the receipt cannot be rewritten after the fact.
 */
export async function recordLot(input: RecordLotInput): Promise<LotView> {
  const rate = input.ratePerQtl ?? (await rateFor("Wheat"));

  const { lot, payment } = await db.transaction(async (tx: Tx) => {
    const [booking] = await tx.select().from(t.bookings).where(eq(t.bookings.ref, input.bookingRef)).limit(1);
    if (!booking) throw notFound("Booking");

    if (input.operatorRole === "operator" && input.operatorCentreId && booking.centreId !== input.operatorCentreId) {
      throw forbidden("This booking is for another centre.");
    }
    if (!["checked_in", "served"].includes(booking.status)) {
      throw conflict("NOT_WEIGHABLE", "This trolley has not reached the counter yet.");
    }

    const existing = await tx.select().from(t.lots).where(eq(t.lots.bookingId, booking.id)).limit(1);
    if (existing[0]) throw conflict("ALREADY_WEIGHED", "A receipt already exists for this trolley.").asCacheable();

    let w;
    try {
      w = computeWeighment({ grossQtl: input.grossQtl, tareQtl: input.tareQtl, moisturePct: input.moisturePct, normPct: input.normPct, ratePerQtl: rate });
    } catch (e) {
      throw unprocessable("INVALID_WEIGHMENT", (e as Error).message);
    }

    const [created] = await tx.insert(t.lots).values({
      receiptNo: receiptNo(),
      bookingId: booking.id,
      userId: booking.userId,
      centreId: booking.centreId,
      crop: booking.crop,
      variety: input.variety ?? null,
      moisturePct: String(input.moisturePct),
      normPct: String(w.normPct),
      grossQtl: String(input.grossQtl),
      tareQtl: String(input.tareQtl),
      netQtl: String(w.netQtl),
      ratePerQtl: String(rate),
      amount: String(w.amount),
      operatorId: input.operatorId,
    }).returning();

    // Payment opens as pending; a DBT run initiates it, the bank return file settles it.
    const [pay] = await tx.insert(t.payments).values({
      lotId: created!.id, userId: booking.userId, amount: String(w.amount), status: "pending",
    }).returning();

    // Mark the booking served if it was still at the counter.
    if (booking.status !== "served") {
      await tx.update(t.bookings).set({ status: "served" }).where(eq(t.bookings.id, booking.id));
    }

    return { lot: { ...created!, moistureOverNorm: w.moistureOverNorm }, payment: pay! };
  });

  await audit({
    actorId: input.operatorId, action: "lot.record", entity: "lot", entityId: lot.id,
    after: { receiptNo: lot.receiptNo, netQtl: lot.netQtl, amount: lot.amount, rate },
  });

  return toLotView(lot, input.bookingRef, payment.status, payment.failureReason);
}

function toLotView(
  lot: typeof t.lots.$inferSelect & { moistureOverNorm?: boolean },
  ref: string,
  paymentStatus: string,
  failureReason: string | null,
): LotView {
  return {
    receiptNo: lot.receiptNo,
    bookingRef: ref,
    crop: lot.crop,
    variety: lot.variety,
    moisturePct: Number(lot.moisturePct),
    normPct: Number(lot.normPct),
    moistureOverNorm: lot.moistureOverNorm ?? Number(lot.moisturePct) > Number(lot.normPct),
    grossQtl: Number(lot.grossQtl),
    tareQtl: Number(lot.tareQtl),
    netQtl: Number(lot.netQtl),
    ratePerQtl: Number(lot.ratePerQtl),
    amount: Number(lot.amount),
    weighedAt: lot.weighedAt.toISOString(),
    payment: { status: paymentStatus, failureReason },
  };
}

export async function listLots(userId: string): Promise<LotView[]> {
  const rows = await db
    .select({ lot: t.lots, ref: t.bookings.ref, pStatus: t.payments.status, pReason: t.payments.failureReason })
    .from(t.lots)
    .innerJoin(t.bookings, eq(t.bookings.id, t.lots.bookingId))
    .leftJoin(t.payments, eq(t.payments.lotId, t.lots.id))
    .where(eq(t.lots.userId, userId))
    .orderBy(desc(t.lots.weighedAt));
  return rows.map((r) => toLotView(r.lot, r.ref, r.pStatus ?? "pending", r.pReason ?? null));
}

/** The digital receipt for one lot — the farmer's proof of what was weighed. */
export async function receiptFor(userId: string, receipt: string) {
  const [row] = await db
    .select({ lot: t.lots, ref: t.bookings.ref, centre: t.centres.name, pStatus: t.payments.status, utr: t.payments.utr, pReason: t.payments.failureReason })
    .from(t.lots)
    .innerJoin(t.bookings, eq(t.bookings.id, t.lots.bookingId))
    .innerJoin(t.centres, eq(t.centres.id, t.lots.centreId))
    .leftJoin(t.payments, eq(t.payments.lotId, t.lots.id))
    .where(and(eq(t.lots.receiptNo, receipt), eq(t.lots.userId, userId)))
    .limit(1);
  if (!row) throw notFound("Receipt");

  const l = row.lot;
  return {
    receiptNo: l.receiptNo,
    centre: row.centre,
    bookingRef: row.ref,
    crop: l.crop,
    variety: l.variety,
    quality: { moisturePct: Number(l.moisturePct), normPct: Number(l.normPct), withinNorm: Number(l.moisturePct) <= Number(l.normPct) },
    weight: { grossQtl: Number(l.grossQtl), tareQtl: Number(l.tareQtl), netQtl: Number(l.netQtl) },
    ratePerQtl: Number(l.ratePerQtl),
    amount: Number(l.amount),
    weighedAt: l.weighedAt.toISOString(),
    payment: { status: row.pStatus ?? "pending", utr: row.utr ?? null, failureReason: row.pReason ?? null },
  };
}
