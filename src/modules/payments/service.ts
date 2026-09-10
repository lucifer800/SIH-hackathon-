import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import * as t from "../../db/schema.js";
import { canTransition, hoursOutstanding, type PaymentStatus } from "../../domain/payments.js";
import { bankReason } from "../../i18n/bankReasons.js";
import { channel } from "../../channels/index.js";
import { audit } from "../../lib/audit.js";
import { nanoIdUtr } from "../../lib/ids.js";
import { notFound } from "../../http/errors.js";

/**
 * Initiate every pending payment — the DBT run. In production this is a nightly
 * worker that files the batch with the treasury; here it is an admin/operator
 * action that flips pending → initiated and stamps the time the 48-hour clock
 * starts from.
 */
export async function initiatePending(actorId: string, centreId?: string): Promise<{ initiated: number }> {
  const pending = await db
    .select({ p: t.payments, centre: t.lots.centreId })
    .from(t.payments)
    .innerJoin(t.lots, eq(t.lots.id, t.payments.lotId))
    .where(and(eq(t.payments.status, "pending"), centreId ? eq(t.lots.centreId, centreId) : undefined));

  let count = 0;
  for (const { p } of pending) {
    await db.update(t.payments)
      .set({ status: "initiated", initiatedAt: new Date(), updatedAt: new Date() })
      .where(eq(t.payments.id, p.id));
    await audit({ actorId, action: "payment.initiate", entity: "payment", entityId: p.id, before: { status: "pending" }, after: { status: "initiated" } });
    count++;
  }
  return { initiated: count };
}

export interface ReturnFileRow {
  receiptNo: string;
  status: "credited" | "failed" | "returned";
  bankCode?: string;
  utr?: string;
}

export interface ReturnFileResult {
  applied: number;
  skipped: { receiptNo: string; reason: string }[];
}

/**
 * The bank return-file importer — the deck's "DBT reconciliation worker (bank
 * return file → reason)". Each row settles a payment and, on failure, fires the
 * SMS that names the exact fix in the farmer's language. This is where slide 5's
 * "failure reason surfaced within 24 h" is actually delivered.
 */
export async function applyReturnFile(actorId: string, rows: ReturnFileRow[]): Promise<ReturnFileResult> {
  const skipped: ReturnFileResult["skipped"] = [];
  let applied = 0;

  for (const row of rows) {
    const [found] = await db
      .select({ p: t.payments, lot: t.lots, user: t.users })
      .from(t.payments)
      .innerJoin(t.lots, eq(t.lots.id, t.payments.lotId))
      .innerJoin(t.users, eq(t.users.id, t.payments.userId))
      .where(eq(t.lots.receiptNo, row.receiptNo))
      .limit(1);

    if (!found) { skipped.push({ receiptNo: row.receiptNo, reason: "no matching receipt" }); continue; }
    if (!canTransition(found.p.status as PaymentStatus, row.status)) {
      skipped.push({ receiptNo: row.receiptNo, reason: `cannot go ${found.p.status} → ${row.status}` });
      continue;
    }

    if (row.status === "credited") {
      const utr = row.utr ?? nanoIdUtr();
      await db.update(t.payments)
        .set({ status: "credited", creditedAt: new Date(), utr, failureCode: null, failureReason: null, updatedAt: new Date() })
        .where(eq(t.payments.id, found.p.id));
      await channel().send({
        userId: found.user.id, to: found.user.mobile, templateId: "payment_credited", language: found.user.language,
        vars: { amount: Number(found.p.amount).toLocaleString("en-IN"), receiptNo: found.lot.receiptNo, utr },
      });
    } else {
      const br = bankReason(row.bankCode ?? "UNKNOWN");
      const reason = br.reason[found.user.language];
      await db.update(t.payments)
        .set({ status: row.status, failureCode: br.code, failureReason: reason, updatedAt: new Date() })
        .where(eq(t.payments.id, found.p.id));
      // The message that names the fix — this is the "surfaced within 24 h" promise.
      await channel().send({
        userId: found.user.id, to: found.user.mobile, templateId: "payment_failed", language: found.user.language,
        vars: { reason, receiptNo: found.lot.receiptNo },
      });
    }

    await audit({
      actorId, action: `payment.${row.status}`, entity: "payment", entityId: found.p.id,
      before: { status: found.p.status }, after: { status: row.status, bankCode: row.bankCode ?? null },
    });
    applied++;
  }

  return { applied, skipped };
}

/** Farmer's payment tracker: the current one to watch, plus the full history. */
export async function listPayments(userId: string) {
  const rows = await db
    .select({ p: t.payments, receiptNo: t.lots.receiptNo, crop: t.lots.crop, variety: t.lots.variety, netQtl: t.lots.netQtl })
    .from(t.payments)
    .innerJoin(t.lots, eq(t.lots.id, t.payments.lotId))
    .where(eq(t.payments.userId, userId))
    .orderBy(desc(t.payments.updatedAt));

  const items = rows.map((r) => ({
    receiptNo: r.receiptNo,
    crop: r.crop,
    variety: r.variety,
    netQtl: Number(r.netQtl),
    amount: Number(r.p.amount),
    status: r.p.status,
    utr: r.p.utr,
    failureReason: r.p.failureReason,
    initiatedAt: r.p.initiatedAt?.toISOString() ?? null,
    creditedAt: r.p.creditedAt?.toISOString() ?? null,
    hoursOutstanding: r.p.status === "initiated" ? hoursOutstanding(r.p.initiatedAt) : null,
  }));

  const active = items.find((i) => i.status === "initiated" || i.status === "failed" || i.status === "returned") ?? null;
  return { active, payments: items };
}

/** One payment by receipt (used by grievance links later). */
export async function paymentByReceipt(userId: string, receipt: string) {
  const [row] = await db
    .select({ p: t.payments })
    .from(t.payments)
    .innerJoin(t.lots, eq(t.lots.id, t.payments.lotId))
    .where(and(eq(t.lots.receiptNo, receipt), eq(t.payments.userId, userId)))
    .limit(1);
  if (!row) throw notFound("Payment");
  return row.p;
}

