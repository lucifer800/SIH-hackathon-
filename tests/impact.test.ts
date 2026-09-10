import { describe, it, expect } from "vitest";
import {
  medianWaitMinutes, peakToAverage, failureSurfacedInTime, knewTheirTurnPct,
  IMPACT_TARGETS,
} from "../src/domain/impact.js";

describe("median wait", () => {
  it("handles odd and even counts", () => {
    expect(medianWaitMinutes([40, 60, 80])).toBe(60);
    expect(medianWaitMinutes([40, 60, 80, 100])).toBe(70);
  });
  it("returns null before anyone has been served", () => {
    expect(medianWaitMinutes([])).toBeNull();
  });
  it("recognises the sub-90-minute target being met", () => {
    expect(medianWaitMinutes([55, 62, 71])!).toBeLessThan(IMPACT_TARGETS.medianWaitMinutes);
  });
});

describe("peak-to-average arrivals", () => {
  it("reads near 4 when everyone arrives at dawn — the problem being solved", () => {
    expect(peakToAverage([40, 5, 3, 4, 2, 3])!).toBeGreaterThan(3);
  });
  it("reads near 1 once slots spread the demand", () => {
    expect(peakToAverage([11, 10, 12, 10, 11, 10])!).toBeLessThan(1.3);
  });
  it("ignores closed hours rather than counting them as calm", () => {
    expect(peakToAverage([0, 0, 10, 10, 0])).toBe(1);
  });
});

describe("payment failure visibility", () => {
  const initiated = new Date("2026-09-01T10:00:00Z");
  it("counts a failure surfaced inside 24 hours", () => {
    expect(failureSurfacedInTime(initiated, new Date("2026-09-02T06:00:00Z"))).toBe(true);
  });
  it("fails the promise at 30 hours", () => {
    expect(failureSurfacedInTime(initiated, new Date("2026-09-02T16:00:00Z"))).toBe(false);
  });
  it("treats never-notified as a failure, not as unknown", () => {
    expect(failureSurfacedInTime(initiated, null)).toBe(false);
  });
});

describe("knowing your turn", () => {
  it("is the headline 0 → 100% claim, measured", () => {
    expect(knewTheirTurnPct(40, 40)).toBe(100);
    expect(knewTheirTurnPct(40, 30)).toBe(75);
    expect(knewTheirTurnPct(0, 0)).toBe(0);
  });
});
