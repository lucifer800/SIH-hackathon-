import { describe, it, expect } from "vitest";
import { computeTransport, TRANSPORT_RATE_PER_KM_PER_QTL } from "../src/domain/transport";

describe("transport cost calculator — net price at the farmer's door", () => {
  it("costs distance × rate per quintal", () => {
    const r = computeTransport(2500, 30, 5);
    expect(r.costPerQtl).toBe(30 * TRANSPORT_RATE_PER_KM_PER_QTL);
  });
  it("net price is mandi price minus the per-quintal transport cost", () => {
    const r = computeTransport(2500, 30, 5);
    expect(r.netPrice).toBe(2500 - 30 * TRANSPORT_RATE_PER_KM_PER_QTL);
  });
  it("total cost scales with trolley weight, not just distance", () => {
    const r = computeTransport(2500, 30, 10);
    expect(r.totalCost).toBe(30 * TRANSPORT_RATE_PER_KM_PER_QTL * 10);
  });
  it("never goes negative even when transport cost exceeds the mandi price", () => {
    const r = computeTransport(50, 200, 20); // 200km × ₹4 = ₹800/qtl >> ₹50 price
    expect(r.netPrice).toBe(0);
  });
  it("percentage of mandi price lost to transport is rounded", () => {
    const r = computeTransport(1000, 25, 5); // cost/qtl = 100 → 10%
    expect(r.pctOfMandiPrice).toBe(10);
  });
  it("zero distance means zero transport cost and full net price", () => {
    const r = computeTransport(2500, 0, 5);
    expect(r.costPerQtl).toBe(0);
    expect(r.netPrice).toBe(2500);
    expect(r.pctOfMandiPrice).toBe(0);
  });
});
