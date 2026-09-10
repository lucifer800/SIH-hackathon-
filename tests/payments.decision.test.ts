import { describe, it, expect } from "vitest";
import { canTransition, computeWeighment, hoursOutstanding, WHEAT_MSP, InvalidWeighment } from "../src/domain/payments.js";
import { bankReason, KNOWN_BANK_CODES } from "../src/i18n/bankReasons.js";

describe("payment state machine", () => {
  it("allows the legal DBT path", () => {
    expect(canTransition("pending", "initiated")).toBe(true);
    expect(canTransition("initiated", "credited")).toBe(true);
    expect(canTransition("initiated", "failed")).toBe(true);
    expect(canTransition("failed", "initiated")).toBe(true);   // retry after fixing KYC
    expect(canTransition("returned", "initiated")).toBe(true);
  });
  it("blocks illegal jumps", () => {
    expect(canTransition("pending", "credited")).toBe(false);  // must be initiated first
    expect(canTransition("credited", "failed")).toBe(false);   // credited is terminal
    expect(canTransition("credited", "initiated")).toBe(false);
  });
});

describe("weighment", () => {
  it("computes net and amount from gross, tare and rate", () => {
    const w = computeWeighment({ grossQtl: 23.6, tareQtl: 0.4, moisturePct: 11, ratePerQtl: WHEAT_MSP });
    expect(w.netQtl).toBe(23.2);
    expect(w.amount).toBe(23.2 * WHEAT_MSP);
    expect(w.moistureOverNorm).toBe(false);
  });
  it("flags moisture over the norm", () => {
    expect(computeWeighment({ grossQtl: 10, tareQtl: 0.2, moisturePct: 14, ratePerQtl: 2000 }).moistureOverNorm).toBe(true);
  });
  it("rejects tare heavier than gross", () => {
    expect(() => computeWeighment({ grossQtl: 5, tareQtl: 6, moisturePct: 10, ratePerQtl: 2000 })).toThrow(InvalidWeighment);
  });
  it("rejects a non-positive rate", () => {
    expect(() => computeWeighment({ grossQtl: 5, tareQtl: 1, moisturePct: 10, ratePerQtl: 0 })).toThrow(InvalidWeighment);
  });
});

describe("bank reasons", () => {
  it("names the exact fix, in three languages", () => {
    const r = bankReason("ACCOUNT_NOT_LINKED");
    expect(r.status).toBe("failed");
    expect(r.reason.hi).toContain("आधार");
    expect(r.reason.pa).toBeTruthy();
    expect(r.reason.en).toContain("KYC");
  });
  it("never returns 'technical reasons' for an unknown code — it says contact the centre", () => {
    const r = bankReason("SOMETHING_NEW");
    expect(r.code).toBe("SOMETHING_NEW");
    expect(r.reason.en).toMatch(/contact the centre/i);
  });
  it("has every known code defined in all three languages", () => {
    for (const c of KNOWN_BANK_CODES) {
      const r = bankReason(c);
      for (const lang of ["pa", "hi", "en"] as const) expect(r.reason[lang]).toBeTruthy();
    }
  });
});

describe("SLA clock", () => {
  it("measures hours outstanding once initiated", () => {
    const t = new Date(Date.now() - 30 * 3600_000);
    expect(hoursOutstanding(t)!).toBeGreaterThanOrEqual(29.9);
  });
  it("is null before initiation", () => {
    expect(hoursOutstanding(null)).toBeNull();
  });
});
