import { and, asc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import * as t from "../../db/schema.js";
import { runIdempotent, hashRequest } from "../../http/idempotency.js";
import { checkin, serveNext } from "../queue/service.js";
import { recordLot } from "../lots/service.js";
import { AppError } from "../../http/errors.js";

/**
 * Offline-first operator console.
 *
 * At a mandi with no network for hours, the console works from a cached day pack,
 * writes check-ins, serve-nexts and weighments to a local outbox, and replays the
 * whole outbox on reconnect. Every operation carries a client UUID, so the replay
 * is idempotent — the deck's "token order is centre-local; syncs on reconnect and
 * the server merges by centre + date".
 */

/** Everything the console needs to run a day offline. */
export async function dayPack(centreId: string, date: string) {
  const [centre] = await db.select().from(t.centres).where(eq(t.centres.id, centreId)).limit(1);
  if (!centre) throw new AppError(404, "NOT_FOUND", "Centre not found.");

  const [day] = await db.select().from(t.centreDays)
    .where(and(eq(t.centreDays.centreId, centreId), eq(t.centreDays.date, date))).limit(1);

  const bookings = await db.select().from(t.bookings)
    .where(and(eq(t.bookings.centreId, centreId), eq(t.bookings.date, date)));

  const tokens = await db.select().from(t.tokens)
    .where(and(eq(t.tokens.centreId, centreId), eq(t.tokens.date, date)))
    .orderBy(asc(t.tokens.seq));

  return {
    centre: { id: centre.id, name: centre.name, lanes: centre.lanes },
    date,
    day: day ? { capacityQtl: day.capacityQtl, capacityTrolleys: day.capacityTrolleys, bookedTrolleys: day.bookedTrolleys, status: day.status } : null,
    // Gate OTPs are hashed and never leave the server, so the console verifies by
    // sending the OTP the farmer shows up to `/op/sync`, not by matching locally.
    bookings: bookings.map((b) => ({ ref: b.ref, crop: b.crop, qtl: Number(b.qtlDeclared), trolleys: b.trolleys, status: b.status })),
    tokens: tokens.map((tok) => ({ seq: tok.seq, bookingId: tok.bookingId, lane: tok.lane, servedAt: tok.servedAt?.toISOString() ?? null })),
    syncedAt: new Date().toISOString(),
  };
}

export type SyncOp =
  | { clientUuid: string; type: "checkin"; bookingRef: string; gateOtp: string; vehicleNo: string; lane?: number; at?: string }
  | { clientUuid: string; type: "serve_next"; lane: number; at?: string }
  | { clientUuid: string; type: "lot"; bookingRef: string; moisturePct: number; grossQtl: number; tareQtl: number; variety?: string };

export interface SyncOpResult {
  clientUuid: string;
  type: string;
  ok: boolean;
  replayed?: boolean;
  result?: unknown;
  error?: { code: string; message: string };
}

/**
 * Applies an outbox in the order the console recorded it. Operations are deduped by
 * client UUID, so re-syncing after a dropped connection is safe. One failed op does
 * not abort the batch — the console needs to know which items landed and which to
 * retry.
 */
export async function applyBatch(input: {
  operatorId: string;
  operatorRole: string;
  operatorCentreId: string | null;
  centreId: string;
  date: string;
  operations: SyncOp[];
}): Promise<{ centreId: string; date: string; results: SyncOpResult[] }> {
  const results: SyncOpResult[] = [];

  for (const op of input.operations) {
    const ctx = { userId: input.operatorId, route: `sync:${op.type}` };
    try {
      const { body, replayed } = await runIdempotent<unknown>(
        op.clientUuid,
        ctx,
        hashRequest(ctx.route, op),
        async (): Promise<{ status: number; body: unknown }> => {
          switch (op.type) {
            case "checkin":
              return { status: 201, body: await checkin({
                operatorId: input.operatorId, operatorRole: input.operatorRole, operatorCentreId: input.operatorCentreId,
                bookingRef: op.bookingRef, gateOtp: op.gateOtp, vehicleNo: op.vehicleNo, lane: op.lane,
                clientUuid: op.clientUuid, ...(op.at ? { checkedInAt: new Date(op.at) } : {}),
              }) };
            case "serve_next":
              return { status: 200, body: await serveNext({ operatorId: input.operatorId, centreId: input.centreId, lane: op.lane, date: input.date }) };
            case "lot":
              return { status: 201, body: await recordLot({
                operatorId: input.operatorId, operatorRole: input.operatorRole, operatorCentreId: input.operatorCentreId,
                bookingRef: op.bookingRef, moisturePct: op.moisturePct, grossQtl: op.grossQtl, tareQtl: op.tareQtl, variety: op.variety,
              }) };
            default:
              throw new AppError(422, "UNKNOWN_OP", "Unknown sync operation.");
          }
        },
      );
      results.push({ clientUuid: op.clientUuid, type: op.type, ok: true, replayed, result: body });
    } catch (e) {
      const err = e as AppError;
      results.push({
        clientUuid: op.clientUuid, type: op.type, ok: false,
        error: { code: err.code ?? "INTERNAL", message: err.message ?? "Sync failed." },
      });
    }
  }

  return { centreId: input.centreId, date: input.date, results };
}

