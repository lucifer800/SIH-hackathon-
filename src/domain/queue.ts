/**
 * Queue ordering and position — pure, so the "who is next" rule can be tested
 * without a database or a clock.
 *
 * The rule from the SIH deck, verbatim: "Order = (slot window, check-in time).
 * Late → back of your own window, not the back of the day." A farmer who booked
 * the 8am window and checked in late is still served before anyone from the 10am
 * window — but behind the 8am farmers who arrived on time.
 */
import { estimateWaitMinutes, rollingMeanServiceSec } from "./fairness.js";

export interface QueueToken {
  id: string;
  seq: number;
  windowStart: Date;
  checkedInAt: Date;
  servedAt: Date | null;
}

/** The published ordering key. Earlier window wins; within a window, earlier check-in wins. */
export function orderKey(t: QueueToken): [number, number] {
  return [t.windowStart.getTime(), t.checkedInAt.getTime()];
}

export function compareTokens(a: QueueToken, b: QueueToken): number {
  const [aw, ac] = orderKey(a);
  const [bw, bc] = orderKey(b);
  return aw - bw || ac - bc || a.seq - b.seq;
}

/** Unserved tokens in the exact order they will be called. */
export function servingOrder(tokens: QueueToken[]): QueueToken[] {
  return tokens.filter((t) => t.servedAt == null).sort(compareTokens);
}

export interface QueueSnapshot {
  seq: number;
  farmersAhead: number;
  queueSize: number;          // everyone in today's line
  nowServing: number | null;  // seq currently at the counter
  estimatedWaitMinutes: number;
  served: boolean;
}

/**
 * Builds one farmer's view of the queue.
 * `nowServingSeq` is whoever is at the counter right now (or last served).
 */
export function farmerSnapshot(
  tokens: QueueToken[],
  myTokenId: string,
  opts: { activeLanes: number; recentDurationsSec: number[]; nowServingSeq: number | null },
): QueueSnapshot | null {
  const me = tokens.find((t) => t.id === myTokenId);
  if (!me) return null;

  const order = servingOrder(tokens);
  const myIndex = order.findIndex((t) => t.id === myTokenId);
  const farmersAhead = myIndex < 0 ? 0 : myIndex; // -1 means already served
  const meanSec = rollingMeanServiceSec(opts.recentDurationsSec);

  return {
    seq: me.seq,
    farmersAhead,
    queueSize: tokens.length,
    nowServing: opts.nowServingSeq,
    estimatedWaitMinutes: me.servedAt ? 0 : estimateWaitMinutes(farmersAhead, opts.activeLanes, meanSec),
    served: me.servedAt != null,
  };
}

export interface BoardSnapshot {
  nowServing: number | null;
  nextUp: number[];           // the next few token numbers, read from across the yard
  inLine: number;
  servedToday: number;
}

/** The mandi-gate big screen. No identity — just token numbers. */
export function boardSnapshot(tokens: QueueToken[], nowServingSeq: number | null, nextCount = 4): BoardSnapshot {
  const order = servingOrder(tokens);
  return {
    nowServing: nowServingSeq,
    nextUp: order.slice(0, nextCount).map((t) => t.seq),
    inLine: order.length,
    servedToday: tokens.filter((t) => t.servedAt != null).length,
  };
}
