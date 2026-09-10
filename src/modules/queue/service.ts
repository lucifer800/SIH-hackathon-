import { and, desc, eq, inArray, isNull, sql as raw } from "drizzle-orm";
import { db } from "../../db/client.js";
import * as t from "../../db/schema.js";
import { verifySecret } from "../../lib/hash.js";
import { channel } from "../../channels/index.js";
import { bus } from "../../realtime/bus.js";
import { applyCompletedVisit } from "../../domain/fairness.js";
import {
  farmerSnapshot, boardSnapshot, servingOrder, type QueueToken, type QueueSnapshot, type BoardSnapshot,
} from "../../domain/queue.js";
import { istDate } from "../../domain/capacity.js";
import { audit } from "../../lib/audit.js";
import { notFound, unprocessable, conflict, forbidden } from "../../http/errors.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/* --------------------------------------------------------- shared reads */

async function tokensForDay(centreId: string, date: string): Promise<QueueToken[]> {
  const rows = await db
    .select({ id: t.tokens.id, seq: t.tokens.seq, windowStart: t.tokens.windowStart, checkedInAt: t.tokens.checkedInAt, servedAt: t.tokens.servedAt })
    .from(t.tokens)
    .where(and(eq(t.tokens.centreId, centreId), eq(t.tokens.date, date)));
  return rows;
}

/** Whoever is at a counter right now (open service event), else the last served. */
async function nowServingSeq(centreId: string, date: string): Promise<number | null> {
  const [open] = await db
    .select({ seq: t.tokens.seq })
    .from(t.serviceEvents)
    .innerJoin(t.tokens, eq(t.tokens.id, t.serviceEvents.tokenId))
    .where(and(eq(t.serviceEvents.centreId, centreId), eq(t.serviceEvents.date, date), isNull(t.serviceEvents.endedAt)))
    .orderBy(desc(t.serviceEvents.startedAt))
    .limit(1);
  if (open) return open.seq;

  const [last] = await db
    .select({ seq: t.tokens.seq })
    .from(t.tokens)
    .where(and(eq(t.tokens.centreId, centreId), eq(t.tokens.date, date)))
    .orderBy(desc(t.tokens.servedAt))
    .limit(1);
  return last?.seq ?? null;
}

async function recentDurations(centreId: string, date: string): Promise<number[]> {
  const rows = await db
    .select({ d: t.serviceEvents.durationSec })
    .from(t.serviceEvents)
    .where(and(eq(t.serviceEvents.centreId, centreId), eq(t.serviceEvents.date, date), raw`${t.serviceEvents.durationSec} is not null`))
    .orderBy(desc(t.serviceEvents.endedAt))
    .limit(20);
  return rows.map((r) => r.d!).reverse();
}

async function laneCount(centreId: string): Promise<number> {
  const [c] = await db.select({ lanes: t.centres.lanes }).from(t.centres).where(eq(t.centres.id, centreId)).limit(1);
  return c?.lanes ?? 1;
}

/* -------------------------------------------------------------- check-in */

export interface CheckinInput {
  operatorId: string;
  operatorRole: string;
  operatorCentreId: string | null;
  bookingRef: string;
  gateOtp: string;
  vehicleNo: string;
  lane?: number;
  clientUuid?: string;
  /** Offline console: the real gate arrival time, so token order reflects when the
   *  farmer actually arrived, not when the batch synced. */
  checkedInAt?: Date;
}

export interface TokenView {
  tokenNumber: string; // zero-padded, e.g. "042"
  seq: number;
  bookingRef: string;
  vehicleNo: string | null;
  windowStart: string;
  lane: number | null;
  checkedInAt: string;
}

const pad = (n: number) => String(n).padStart(3, "0");

/**
 * The gate. A booking becomes a token only here — OTP + vehicle number proving the
 * registered farmer actually arrived. That is what makes a token worthless to
 * resell: the buyer would need the seller's SMS code AND to show up in the right
 * vehicle. Idempotent on clientUuid so an offline console can replay safely.
 */
export async function checkin(input: CheckinInput): Promise<TokenView> {
  if (!input.vehicleNo?.trim()) throw unprocessable("VEHICLE_REQUIRED", "Enter the vehicle number at the gate.");

  // Offline replay: the same physical check-in must not create two tokens.
  if (input.clientUuid) {
    const [existing] = await db.select().from(t.tokens).where(eq(t.tokens.clientUuid, input.clientUuid)).limit(1);
    if (existing) return toTokenView(existing, input.bookingRef);
  }

  const token = await db.transaction(async (tx: Tx) => {
    const [booking] = await tx.select().from(t.bookings).where(eq(t.bookings.ref, input.bookingRef)).limit(1);
    if (!booking) throw notFound("Booking");

    if (input.operatorRole === "operator" && input.operatorCentreId && booking.centreId !== input.operatorCentreId) {
      throw forbidden("This booking is for another centre.");
    }
    if (booking.status === "checked_in") throw conflict("ALREADY_CHECKED_IN", "This trolley is already in the queue.");
    if (booking.status !== "booked") throw conflict("NOT_CHECKABLE", "This booking cannot be checked in.");
    if (!verifySecret(input.gateOtp, booking.gateOtpHash)) throw unprocessable("GATE_OTP_INVALID", "That gate code is not right.");

    const [slot] = await tx.select().from(t.slots).where(eq(t.slots.id, booking.slotId)).limit(1);

    // Lock the centre-day so token numbers are assigned without a gap or a clash.
    await tx.select().from(t.centreDays)
      .where(and(eq(t.centreDays.centreId, booking.centreId), eq(t.centreDays.date, booking.date)))
      .for("update").limit(1);

    const [seqRow] = await tx
      .select({ maxSeq: raw<number>`coalesce(max(${t.tokens.seq}),0)::int` })
      .from(t.tokens)
      .where(and(eq(t.tokens.centreId, booking.centreId), eq(t.tokens.date, booking.date)));

    const [created] = await tx.insert(t.tokens).values({
      bookingId: booking.id,
      centreId: booking.centreId,
      date: booking.date,
      seq: (seqRow?.maxSeq ?? 0) + 1,
      lane: input.lane ?? null,
      windowStart: slot!.windowStart,
      ...(input.checkedInAt ? { checkedInAt: input.checkedInAt } : {}),
      clientUuid: input.clientUuid ?? null,
    }).returning();

    await tx.update(t.bookings)
      .set({ status: "checked_in", vehicleNo: input.vehicleNo.trim().toUpperCase() })
      .where(eq(t.bookings.id, booking.id));

    return created!;
  });

  bus.publish(token.centreId, token.date);
  await audit({ actorId: input.operatorId, action: "token.issue", entity: "token", entityId: token.id, after: { seq: token.seq, bookingRef: input.bookingRef, lane: token.lane } });
  return toTokenView(token, input.bookingRef);
}

function toTokenView(tok: typeof t.tokens.$inferSelect, ref: string): TokenView {
  return {
    tokenNumber: pad(tok.seq),
    seq: tok.seq,
    bookingRef: ref,
    vehicleNo: null,
    windowStart: tok.windowStart.toISOString(),
    lane: tok.lane,
    checkedInAt: tok.checkedInAt.toISOString(),
  };
}

/* ------------------------------------------------------------ serve next */

export interface ServeInput {
  operatorId: string;
  centreId: string;
  lane: number;
  date?: string;
}

export interface ServeResult {
  finished: number | null; // token seq just completed
  nowServing: number | null;
  board: BoardSnapshot;
}

/**
 * "Bring the next trolley." Closes the token currently at this lane (recording how
 * long it took — that duration feeds every ETA in the system) and starts the next
 * one in published order. The single operator action the whole live floor turns on.
 */
export async function serveNext(input: ServeInput): Promise<ServeResult> {
  const date = input.date ?? istDate();
  let finishedSeq: number | null = null;

  await db.transaction(async (tx: Tx) => {
    await tx.select().from(t.centreDays)
      .where(and(eq(t.centreDays.centreId, input.centreId), eq(t.centreDays.date, date)))
      .for("update").limit(1);

    // 1. Finish whatever this lane was serving.
    const [open] = await tx.select().from(t.serviceEvents)
      .where(and(eq(t.serviceEvents.centreId, input.centreId), eq(t.serviceEvents.date, date), eq(t.serviceEvents.lane, input.lane), isNull(t.serviceEvents.endedAt)))
      .limit(1);

    if (open) {
      const now = new Date();
      const durationSec = Math.max(1, Math.round((now.getTime() - open.startedAt.getTime()) / 1000));
      await tx.update(t.serviceEvents).set({ endedAt: now, durationSec }).where(eq(t.serviceEvents.id, open.id));
      const [tok] = await tx.update(t.tokens).set({ servedAt: now }).where(eq(t.tokens.id, open.tokenId)).returning();
      finishedSeq = tok!.seq;
      const [b] = await tx.select().from(t.bookings).where(eq(t.bookings.id, tok!.bookingId)).limit(1);
      if (b) {
        await tx.update(t.bookings).set({ status: "served" }).where(eq(t.bookings.id, b.id));
        // A completed visit earns back a little priority — the mirror of the no-show penalty.
        const [u] = await tx.select().from(t.users).where(eq(t.users.id, b.userId)).limit(1);
        if (u) await tx.update(t.users).set({ priorityScore: applyCompletedVisit(u.priorityScore) }).where(eq(t.users.id, u.id));
      }
    }

    // 2. Start the next token in order, skipping any already at another lane.
    const openTokenIds = (await tx.select({ id: t.serviceEvents.tokenId }).from(t.serviceEvents)
      .where(and(eq(t.serviceEvents.centreId, input.centreId), eq(t.serviceEvents.date, date), isNull(t.serviceEvents.endedAt)))).map((r) => r.id);

    const candidates = await tx.select().from(t.tokens)
      .where(and(eq(t.tokens.centreId, input.centreId), eq(t.tokens.date, date), isNull(t.tokens.servedAt)));
    const next = servingOrder(candidates.map((c) => ({ id: c.id, seq: c.seq, windowStart: c.windowStart, checkedInAt: c.checkedInAt, servedAt: c.servedAt })))
      .find((c) => !openTokenIds.includes(c.id));

    if (next) {
      await tx.insert(t.serviceEvents).values({
        tokenId: next.id, centreId: input.centreId, date, lane: input.lane, operatorId: input.operatorId,
      });
      await tx.update(t.tokens).set({ lane: input.lane }).where(eq(t.tokens.id, next.id));
    }
  });

  bus.publish(input.centreId, date);
  if (finishedSeq != null) await audit({ actorId: input.operatorId, action: "token.served", entity: "token", entityId: `${input.centreId}:${date}:${finishedSeq}`, after: { seq: finishedSeq, lane: input.lane } });
  await runNotifyWatcher(input.centreId, date); // fire "5 away" for anyone who crossed the line

  return { finished: finishedSeq, nowServing: await nowServingSeq(input.centreId, date), board: await board(input.centreId, date) };
}

/* --------------------------------------------------------- farmer view */

/** The farmer's live queue card. Finds their checked-in token for today. */
export async function farmerQueue(userId: string): Promise<{ centreId: string; date: string; queue: QueueSnapshot } | null> {
  const [tok] = await db
    .select({ token: t.tokens })
    .from(t.tokens)
    .innerJoin(t.bookings, eq(t.bookings.id, t.tokens.bookingId))
    .where(and(eq(t.bookings.userId, userId), isNull(t.tokens.servedAt)))
    .orderBy(desc(t.tokens.checkedInAt))
    .limit(1);
  if (!tok) return null;

  const { centreId, date } = tok.token;
  const all = await tokensForDay(centreId, date);
  const snap = farmerSnapshot(all, tok.token.id, {
    activeLanes: await laneCount(centreId),
    recentDurationsSec: await recentDurations(centreId, date),
    nowServingSeq: await nowServingSeq(centreId, date),
  });
  return snap ? { centreId, date, queue: snap } : null;
}

/** Snapshot for a specific token id (used by the SSE stream). */
export async function snapshotForToken(tokenId: string): Promise<{ centreId: string; date: string; queue: QueueSnapshot } | null> {
  const [tok] = await db.select().from(t.tokens).where(eq(t.tokens.id, tokenId)).limit(1);
  if (!tok) return null;
  const all = await tokensForDay(tok.centreId, tok.date);
  const snap = farmerSnapshot(all, tokenId, {
    activeLanes: await laneCount(tok.centreId),
    recentDurationsSec: await recentDurations(tok.centreId, tok.date),
    nowServingSeq: await nowServingSeq(tok.centreId, tok.date),
  });
  return snap ? { centreId: tok.centreId, date: tok.date, queue: snap } : null;
}

/* ----------------------------------------------------------- the board */

export async function board(centreId: string, date = istDate()): Promise<BoardSnapshot> {
  const all = await tokensForDay(centreId, date);
  return boardSnapshot(all, await nowServingSeq(centreId, date));
}

/**
 * Anonymised token ledger — the deck's answer to "farmers don't trust the
 * algorithm". Anyone can see the day's order and outcomes, with no names or
 * mobiles: just token numbers, windows and served times. The order is auditable
 * without exposing a single farmer's identity.
 */
export async function ledger(centreId: string, date = istDate()) {
  const all = (await db
    .select({ seq: t.tokens.seq, windowStart: t.tokens.windowStart, checkedInAt: t.tokens.checkedInAt, servedAt: t.tokens.servedAt })
    .from(t.tokens)
    .where(and(eq(t.tokens.centreId, centreId), eq(t.tokens.date, date))))
    .sort((a, b) => (a.windowStart.getTime() - b.windowStart.getTime()) || (a.checkedInAt.getTime() - b.checkedInAt.getTime()));
  return {
    centreId,
    date,
    rule: "Order = (slot window, check-in time).",
    entries: all.map((r) => ({
      token: pad(r.seq),
      window: r.windowStart.toISOString(),
      checkedInAt: r.checkedInAt.toISOString(),
      servedAt: r.servedAt?.toISOString() ?? null,
      status: r.servedAt ? "served" : "waiting",
    })),
  };
}

/* -------------------------------------------------------- ring my phone */

export async function registerNotify(userId: string, threshold = 5, channelName: "sms" | "ivr" = "sms") {
  const [tok] = await db
    .select({ token: t.tokens })
    .from(t.tokens)
    .innerJoin(t.bookings, eq(t.bookings.id, t.tokens.bookingId))
    .where(and(eq(t.bookings.userId, userId), isNull(t.tokens.servedAt)))
    .orderBy(desc(t.tokens.checkedInAt))
    .limit(1);
  if (!tok) throw unprocessable("NO_ACTIVE_TOKEN", "You are not in a queue right now.");

  await db.insert(t.queueNotifies).values({
    tokenId: tok.token.id, userId, centreId: tok.token.centreId, date: tok.token.date, threshold, channel: channelName,
  }).onConflictDoUpdate({ target: t.queueNotifies.tokenId, set: { threshold, channel: channelName, firedAt: null } });

  return { message: `We will call you when you are ${threshold} trolleys away.` };
}

/** After every serve-next: ring anyone whose turn just came within their threshold. */
async function runNotifyWatcher(centreId: string, date: string) {
  const pending = await db.select().from(t.queueNotifies)
    .where(and(eq(t.queueNotifies.centreId, centreId), eq(t.queueNotifies.date, date), isNull(t.queueNotifies.firedAt)));
  if (!pending.length) return;

  const all = await tokensForDay(centreId, date);
  const order = servingOrder(all);

  for (const n of pending) {
    const idx = order.findIndex((o) => o.id === n.tokenId);
    if (idx < 0) continue; // already served
    if (idx <= n.threshold) {
      const [u] = await db.select().from(t.users).where(eq(t.users.id, n.userId)).limit(1);
      const [tok] = await db.select().from(t.tokens).where(eq(t.tokens.id, n.tokenId)).limit(1);
      if (u && tok) {
        await channel().send({
          userId: u.id, to: u.mobile, templateId: "queue_five_away", language: u.language,
          channel: n.channel, vars: { ahead: idx, lane: tok.lane ?? 1 },
        });
      }
      await db.update(t.queueNotifies).set({ firedAt: new Date() }).where(eq(t.queueNotifies.id, n.id));
    }
  }
}

export { tokensForDay };
export const _forTests = { nowServingSeq, recentDurations };
