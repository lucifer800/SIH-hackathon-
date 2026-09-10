import { describe, it, expect } from "vitest";
import { compareTokens, servingOrder, farmerSnapshot, boardSnapshot, type QueueToken } from "../src/domain/queue.js";

const tok = (seq: number, windowH: number, checkinMin: number, served = false): QueueToken => ({
  id: `t${seq}`, seq,
  windowStart: new Date(`2026-09-10T${String(windowH).padStart(2, "0")}:00:00+05:30`),
  checkedInAt: new Date(`2026-09-10T${String(windowH).padStart(2, "0")}:${String(checkinMin).padStart(2, "0")}:00+05:30`),
  servedAt: served ? new Date() : null,
});

describe("ordering — (window, check-in), the published rule", () => {
  it("serves an earlier window before a later one", () => {
    expect(compareTokens(tok(2, 8, 30), tok(1, 10, 0))).toBeLessThan(0); // 8am beats 10am despite later check-in min
  });
  it("within a window, earlier check-in wins — late goes to the back of its OWN window", () => {
    const order = servingOrder([tok(1, 8, 45), tok(2, 8, 5), tok(3, 8, 20)]);
    expect(order.map((t) => t.seq)).toEqual([2, 3, 1]);
  });
  it("a late 8am farmer still beats an on-time 10am farmer", () => {
    const order = servingOrder([tok(1, 10, 0), tok(2, 8, 55)]);
    expect(order.map((t) => t.seq)).toEqual([2, 1]);
  });
  it("drops served tokens from the order", () => {
    const order = servingOrder([tok(1, 8, 0, true), tok(2, 8, 10)]);
    expect(order.map((t) => t.seq)).toEqual([2]);
  });
});

describe("farmer snapshot", () => {
  const tokens = [tok(1, 8, 0, true), tok(2, 8, 10), tok(3, 8, 20), tok(4, 8, 30)];
  it("counts farmers ahead and estimates the wait", () => {
    const snap = farmerSnapshot(tokens, "t4", { activeLanes: 2, recentDurationsSec: [120, 120], nowServingSeq: 2 })!;
    expect(snap.seq).toBe(4);
    expect(snap.farmersAhead).toBe(2);        // t2, t3 ahead of t4
    expect(snap.queueSize).toBe(4);
    expect(snap.nowServing).toBe(2);
    expect(snap.estimatedWaitMinutes).toBe(2); // 2 ahead / 2 lanes * 2min = 2
  });
  it("reports zero wait once served", () => {
    const snap = farmerSnapshot(tokens, "t1", { activeLanes: 2, recentDurationsSec: [120], nowServingSeq: 2 })!;
    expect(snap.served).toBe(true);
    expect(snap.estimatedWaitMinutes).toBe(0);
  });
});

describe("board", () => {
  it("shows now-serving and the next few token numbers", () => {
    const tokens = [tok(1, 8, 0, true), tok(2, 8, 10), tok(3, 8, 20), tok(4, 8, 30), tok(5, 8, 40), tok(6, 8, 50)];
    const b = boardSnapshot(tokens, 2);
    expect(b.nowServing).toBe(2);
    expect(b.nextUp).toEqual([2, 3, 4, 5]);
    expect(b.inLine).toBe(5);
    expect(b.servedToday).toBe(1);
  });
});
