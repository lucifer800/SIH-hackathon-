/**
 * The published fairness rules from the SIH deck, as pure functions.
 *
 * The deck's own risk table says farmers will not trust an algorithm they cannot
 * see. So these rules are deliberately simple, stated in one place, and exposed
 * verbatim through `GET /public/rules` — nothing here should need a paragraph of
 * explanation.
 */

export const FAIRNESS_RULES = {
  /** Order = (slot window, check-in time). Late means the back of YOUR window. */
  ordering: "slot_window_then_checkin",
  /** Rained-out farmers get first refusal on the capacity that gets released. */
  firstRefusalHours: 6,
  /** Held back for spill-over when a day collapses. */
  reservePct: 15,
  /** Held for holdings under 2 ha. */
  smallHolderPct: 30,
  smallHolderMaxHa: 2,
  /** Both pools open to everyone this many hours before the day. */
  poolReleaseHoursBefore: 24,
  /** How long after the window closes before a booking counts as a no-show. */
  noShowGraceMinutes: 90,
  /** Each no-show costs this much priority; each completed visit earns some back. */
  noShowPenalty: 15,
  noShowRecovery: 5,
  priorityFloor: 40,
  priorityCeiling: 100,
} as const;

export type Pool = "general" | "reserve" | "small_holder";

export interface PoolContext {
  areaHa: number;
  /** Hours from now until the day starts. */
  hoursUntilDay: number;
  /** Does this farmer hold an unexpired first-refusal claim on this slot? */
  hasHold: boolean;
}

/**
 * Which pools a farmer may draw from, most-protected first. The booking
 * transaction walks this list and takes the first pool with room.
 */
export function eligiblePools(ctx: PoolContext): Pool[] {
  const pools: Pool[] = [];
  if (ctx.hasHold) pools.push("reserve");
  if (ctx.areaHa <= FAIRNESS_RULES.smallHolderMaxHa) pools.push("small_holder");
  pools.push("general");
  // Once the pools release, everything is general capacity anyway.
  if (ctx.hoursUntilDay <= FAIRNESS_RULES.poolReleaseHoursBefore && !ctx.hasHold) {
    return ["general"];
  }
  return [...new Set(pools)];
}

export interface PoolSplit {
  general: number;
  reserve: number;
  smallHolder: number;
}

/** Splits a slot's trolley capacity into the three pools. */
export function splitPools(capacityTrolleys: number, released: boolean): PoolSplit {
  if (released) return { general: capacityTrolleys, reserve: 0, smallHolder: 0 };
  const reserve = Math.floor((capacityTrolleys * FAIRNESS_RULES.reservePct) / 100);
  const smallHolder = Math.floor((capacityTrolleys * FAIRNESS_RULES.smallHolderPct) / 100);
  return { general: capacityTrolleys - reserve - smallHolder, reserve, smallHolder };
}

/**
 * Quantity is capped by the land record — the deck's answer to "traders posing
 * as growers". A farmer can never book more than their remaining entitlement.
 */
export function bookableQtl(entitlementQtl: number, usedQtl: number, requestedQtl: number) {
  const remaining = Math.max(0, entitlementQtl - usedQtl);
  return {
    allowed: requestedQtl <= remaining && requestedQtl > 0,
    remaining,
    requestedQtl,
  };
}

export function applyNoShow(priorityScore: number): number {
  return Math.max(FAIRNESS_RULES.priorityFloor, priorityScore - FAIRNESS_RULES.noShowPenalty);
}

export function applyCompletedVisit(priorityScore: number): number {
  return Math.min(FAIRNESS_RULES.priorityCeiling, priorityScore + FAIRNESS_RULES.noShowRecovery);
}

/** A booking is a no-show once its window has been closed for the grace period. */
export function isNoShow(windowEnd: Date, now = new Date()): boolean {
  return now.getTime() - windowEnd.getTime() > FAIRNESS_RULES.noShowGraceMinutes * 60_000;
}

export function firstRefusalExpiry(from = new Date()): Date {
  return new Date(from.getTime() + FAIRNESS_RULES.firstRefusalHours * 3_600_000);
}

/* ------------------------------------------------------------------ queue */

/** ETA = tokens ahead ÷ active lanes × rolling mean service time. */
export function estimateWaitMinutes(
  tokensAhead: number,
  activeLanes: number,
  meanServiceSec: number,
): number {
  if (tokensAhead <= 0) return 0;
  const lanes = Math.max(1, activeLanes);
  return Math.max(1, Math.round((tokensAhead / lanes) * (meanServiceSec / 60)));
}

/** Rolling mean over the last N completed lots. Falls back to a sane default. */
export function rollingMeanServiceSec(durations: number[], window = 20, fallback = 120): number {
  const recent = durations.slice(-window).filter((d) => d > 0);
  if (!recent.length) return fallback;
  return Math.round(recent.reduce((a, b) => a + b, 0) / recent.length);
}
