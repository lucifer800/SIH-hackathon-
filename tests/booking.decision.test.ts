import { describe, it, expect } from "vitest";
import { decideBooking, poolRemaining, type SlotState, type FarmerState } from "../src/domain/booking.js";

const empty = { general: 0, reserve: 0, small_holder: 0 };
const large: FarmerState = { areaHa: 5, entitlementQtl: 200, usedQtl: 0, hasHold: false, hoursUntilDay: 72 };
const small: FarmerState = { areaHa: 1.5, entitlementQtl: 64, usedQtl: 0, hasHold: false, hoursUntilDay: 72 };

// 100-trolley slot, > 24h away → split 55 general / 15 reserve / 30 small-holder.
const openSlot = (over: Partial<SlotState> = {}): SlotState => ({
  capacityTrolleys: 100, bookedTrolleys: 0, bookedByPool: { ...empty }, released: false, ...over,
});

describe("decideBooking — entitlement cap", () => {
  it("refuses a quantity beyond the remaining land-record entitlement", () => {
    const d = decideBooking({ ...large, entitlementQtl: 64, usedQtl: 60 }, openSlot(), { qtl: 20, trolleys: 1 });
    expect(d).toMatchObject({ ok: false, code: "ENTITLEMENT_EXCEEDED" });
  });
  it("allows a quantity inside it", () => {
    expect(decideBooking(large, openSlot(), { qtl: 20, trolleys: 1 }).ok).toBe(true);
  });
  it("refuses zero or negative", () => {
    expect(decideBooking(large, openSlot(), { qtl: 0, trolleys: 1 })).toMatchObject({ code: "INVALID_QUANTITY" });
  });
});

describe("decideBooking — pools", () => {
  it("puts a small holder in the small-holder pool", () => {
    expect(decideBooking(small, openSlot(), { qtl: 10, trolleys: 1 })).toMatchObject({ ok: true, pool: "small_holder" });
  });
  it("puts a large holder in general", () => {
    expect(decideBooking(large, openSlot(), { qtl: 10, trolleys: 1 })).toMatchObject({ ok: true, pool: "general" });
  });
  it("refuses a large holder when general is full even though reserve has room", () => {
    // general cap 55 full; reserve (15) and small (30) still open but not for them.
    const d = decideBooking(large, openSlot({ bookedTrolleys: 55, bookedByPool: { general: 55, reserve: 0, small_holder: 0 } }), { qtl: 10, trolleys: 1 });
    expect(d).toMatchObject({ ok: false, code: "SLOT_FULL" });
  });
  it("lets a small holder fall back to general once their pool is full", () => {
    const d = decideBooking(small, openSlot({ bookedTrolleys: 30, bookedByPool: { general: 0, reserve: 0, small_holder: 30 } }), { qtl: 10, trolleys: 1 });
    expect(d).toMatchObject({ ok: true, pool: "general" });
  });
});

describe("decideBooking — total capacity", () => {
  it("refuses when the whole slot is full regardless of pool", () => {
    const d = decideBooking(large, openSlot({ bookedTrolleys: 100, bookedByPool: { general: 55, reserve: 15, small_holder: 30 } }), { qtl: 10, trolleys: 1 });
    expect(d).toMatchObject({ ok: false, code: "SLOT_FULL" });
  });
  it("never lets pooled capacity oversell the slot total", () => {
    const slot = openSlot();
    const split = poolRemaining(slot, "general") + poolRemaining(slot, "reserve") + poolRemaining(slot, "small_holder");
    expect(split).toBe(slot.capacityTrolleys);
  });
});

describe("decideBooking — released pools", () => {
  it("collapses everything into general within 24h and conserves the total", () => {
    const slot = openSlot({ released: true, bookedTrolleys: 40, bookedByPool: { general: 20, reserve: 10, small_holder: 10 } });
    expect(poolRemaining(slot, "general")).toBe(60);
    expect(poolRemaining(slot, "reserve")).toBe(0);
    // a large holder can now use what was reserved capacity
    expect(decideBooking(large, slot, { qtl: 10, trolleys: 1 })).toMatchObject({ ok: true, pool: "general" });
  });
});
