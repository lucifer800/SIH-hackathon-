import { describe, it, expect } from "vitest";
import {
  FAIRNESS_RULES, eligiblePools, splitPools, bookableQtl, applyNoShow,
  applyCompletedVisit, isNoShow, firstRefusalExpiry, estimateWaitMinutes,
  rollingMeanServiceSec,
} from "../src/domain/fairness.js";

describe("pool eligibility", () => {
  it("puts a small holder in the protected pool first", () => {
    expect(eligiblePools({ areaHa: 1.6, hoursUntilDay: 72, hasHold: false }))
      .toEqual(["small_holder", "general"]);
  });

  it("gives a large holder only general capacity", () => {
    expect(eligiblePools({ areaHa: 5, hoursUntilDay: 72, hasHold: false }))
      .toEqual(["general"]);
  });

  it("lets a rained-out farmer reach the reserve pool first", () => {
    expect(eligiblePools({ areaHa: 5, hoursUntilDay: 3, hasHold: true })[0]).toBe("reserve");
  });

  it("opens everything to everyone inside the 24-hour release window", () => {
    expect(eligiblePools({ areaHa: 1.2, hoursUntilDay: 12, hasHold: false }))
      .toEqual(["general"]);
  });
});

describe("pool split", () => {
  it("holds back 15% reserve and 30% for small holdings", () => {
    expect(splitPools(100, false)).toEqual({ general: 55, reserve: 15, smallHolder: 30 });
  });

  it("never loses a trolley to rounding", () => {
    for (const n of [1, 3, 7, 13, 47, 99]) {
      const s = splitPools(n, false);
      expect(s.general + s.reserve + s.smallHolder).toBe(n);
      expect(s.general).toBeGreaterThanOrEqual(0);
    }
  });

  it("collapses to general capacity once released", () => {
    expect(splitPools(40, true)).toEqual({ general: 40, reserve: 0, smallHolder: 0 });
  });
});

describe("entitlement cap", () => {
  it("allows a booking inside the remaining land-record entitlement", () => {
    expect(bookableQtl(128, 31.2, 23)).toMatchObject({ allowed: true, remaining: 96.8 });
  });

  it("refuses a trader booking more than the land record supports", () => {
    expect(bookableQtl(64, 60, 20).allowed).toBe(false);
  });

  it("refuses zero and negative quantities", () => {
    expect(bookableQtl(100, 0, 0).allowed).toBe(false);
    expect(bookableQtl(100, 0, -5).allowed).toBe(false);
  });
});

describe("no-show priority", () => {
  it("lowers the score but never below the floor", () => {
    let score = 100;
    for (let i = 0; i < 20; i++) score = applyNoShow(score);
    expect(score).toBe(FAIRNESS_RULES.priorityFloor);
  });

  it("recovers on completed visits but never above the ceiling", () => {
    let score = applyNoShow(100);
    expect(score).toBe(85);
    for (let i = 0; i < 20; i++) score = applyCompletedVisit(score);
    expect(score).toBe(FAIRNESS_RULES.priorityCeiling);
  });

  it("only counts a no-show after the grace window", () => {
    const windowEnd = new Date("2026-09-10T12:00:00+05:30");
    const inGrace = new Date("2026-09-10T13:00:00+05:30");   // 60 min
    const past = new Date("2026-09-10T14:00:00+05:30");      // 120 min
    expect(isNoShow(windowEnd, inGrace)).toBe(false);
    expect(isNoShow(windowEnd, past)).toBe(true);
  });
});

describe("first refusal", () => {
  it("expires six hours after the disruption", () => {
    const from = new Date("2026-09-10T09:00:00Z");
    expect(firstRefusalExpiry(from).toISOString()).toBe("2026-09-10T15:00:00.000Z");
  });
});

describe("queue ETA", () => {
  it("divides across active lanes", () => {
    // 24 ahead, 3 lanes, 2 min per lot → 16 min
    expect(estimateWaitMinutes(24, 3, 120)).toBe(16);
  });

  it("is zero when you are at the counter", () => {
    expect(estimateWaitMinutes(0, 2, 120)).toBe(0);
  });

  it("survives a centre reporting zero lanes", () => {
    expect(estimateWaitMinutes(10, 0, 120)).toBe(20);
  });

  it("means over the last 20 lots only", () => {
    const durations = [...Array(30).fill(600), ...Array(20).fill(60)];
    expect(rollingMeanServiceSec(durations)).toBe(60);
  });

  it("falls back when a centre has served nothing yet", () => {
    expect(rollingMeanServiceSec([])).toBe(120);
  });
});
