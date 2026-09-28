import { describe, it, expect } from "vitest";
import { deriveJourneyStage } from "../src/domain/journey.js";

describe("produce journey — stage derived from existing rows, no new columns", () => {
  it("stage 1: booked, not yet at the gate", () => {
    expect(deriveJourneyStage({ bookingStatus: "booked", hasLot: false, paymentStatus: null })).toBe(1);
  });
  it("stage 2: checked in at the gate, not yet weighed", () => {
    expect(deriveJourneyStage({ bookingStatus: "checked_in", hasLot: false, paymentStatus: null })).toBe(2);
  });
  it("stage 3: weighed (a lot exists), payment not yet initiated", () => {
    expect(deriveJourneyStage({ bookingStatus: "checked_in", hasLot: true, paymentStatus: null })).toBe(3);
  });
  it("stage 4: payment initiated but not credited", () => {
    expect(deriveJourneyStage({ bookingStatus: "checked_in", hasLot: true, paymentStatus: "initiated" })).toBe(4);
    expect(deriveJourneyStage({ bookingStatus: "checked_in", hasLot: true, paymentStatus: "failed" })).toBe(4);
  });
  it("stage 5: paid — the only terminal state", () => {
    expect(deriveJourneyStage({ bookingStatus: "checked_in", hasLot: true, paymentStatus: "credited" })).toBe(5);
  });
  it("a payment row always outranks lot/booking status, even on stale inputs", () => {
    // defensive: if a payment exists, the booking is by definition already served
    expect(deriveJourneyStage({ bookingStatus: "booked", hasLot: false, paymentStatus: "credited" })).toBe(5);
  });
});
