import { describe, it, expect } from "vitest";
import {
  computeCapacity, planDay, trolleysFor, addDays, QTL_PER_TROLLEY, SLOT_WINDOWS,
} from "../src/domain/capacity.js";

describe("computeCapacity", () => {
  it("takes the minimum of the three inputs", () => {
    const r = computeCapacity({
      weighbridgeQtlDay: 1800, gunnyBags: 4200, qtlPerBag: 0.5, godownFreeQtl: 2400,
    });
    expect(r.capacityQtl).toBe(1800);          // bags give 2100, godown 2400
    expect(r.bindingConstraint).toBe("weighbridge");
  });

  it("names the godown when it is the tightest", () => {
    const r = computeCapacity({
      weighbridgeQtlDay: 1500, gunnyBags: 3000, qtlPerBag: 0.5, godownFreeQtl: 900,
    });
    expect(r.capacityQtl).toBe(900);
    expect(r.bindingConstraint).toBe("godown");
  });

  it("names the bag shortage when bags run out", () => {
    const r = computeCapacity({
      weighbridgeQtlDay: 1800, gunnyBags: 400, qtlPerBag: 0.5, godownFreeQtl: 2400,
    });
    expect(r.capacityQtl).toBe(200);
    expect(r.bindingConstraint).toBe("gunny_bags");
  });
});

describe("planDay", () => {
  it("splits the day into five two-hour windows", () => {
    const slots = planDay("2026-09-10", 1000);
    expect(slots).toHaveLength(SLOT_WINDOWS.length);
    for (const s of slots) {
      expect(s.windowEnd.getTime() - s.windowStart.getTime()).toBe(2 * 60 * 60 * 1000);
    }
  });

  it("never plans more trolleys than the day's capacity allows", () => {
    const capacity = 1000;
    const planned = planDay("2026-09-10", capacity);
    const total = planned.reduce((n, s) => n + s.capacityTrolleys, 0);
    expect(total).toBe(trolleysFor(capacity));
    expect(total * QTL_PER_TROLLEY).toBeLessThanOrEqual(capacity);
  });

  it("gives the remainder to the earliest windows", () => {
    const planned = planDay("2026-09-10", 25 * 12); // 12 trolleys over 5 windows
    expect(planned.map((s) => s.capacityTrolleys)).toEqual([3, 3, 2, 2, 2]);
  });

  it("anchors windows to IST regardless of server timezone", () => {
    const [first] = planDay("2026-09-10", 500);
    expect(first!.windowStart.toISOString()).toBe("2026-09-10T02:30:00.000Z"); // 08:00 IST
  });
});

describe("addDays", () => {
  it("crosses a month boundary", () => {
    expect(addDays("2026-09-29", 3)).toBe("2026-10-02");
  });
  it("goes backwards", () => {
    expect(addDays("2026-09-02", -5)).toBe("2026-08-28");
  });
});
