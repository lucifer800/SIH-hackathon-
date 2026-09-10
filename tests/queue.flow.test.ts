/**
 * The L3 gate, at the service level: a booking is checked in at the gate, becomes
 * a token, an operator serves the line, and the farmer's snapshot + the public
 * board both reflect it. Plus the anti-resale check (wrong gate OTP) and the
 * "5 away" ring.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, eq, inArray, sql as raw } from "drizzle-orm";
import { db, sql } from "../src/db/client.js";
import * as t from "../src/db/schema.js";
import { book } from "../src/modules/bookings/service.js";
import { checkin, serveNext, farmerQueue, board, ledger, registerNotify } from "../src/modules/queue/service.js";
import { istDate } from "../src/domain/capacity.js";
import { AppError } from "../src/http/errors.js";

const CODE = "queue-flow-centre";
let centreId = "";
let operatorId = "";
let dayId = "";
let slotEarly = "";
let slotLate = "";
const userIds: string[] = [];
const gateOtps: Record<string, string> = {};   // bookingRef -> gate otp (from book() dev field)
const refs: string[] = [];

async function makeFarmerBooking(i: number, slotId: string) {
  const [u] = await db.insert(t.users).values({
    mobile: `+9198111${String(i).padStart(5, "0")}`, name: `QFarmer ${i}`, language: "en", role: "farmer",
  }).returning();
  await db.insert(t.holdings).values({
    userId: u!.id, village: "T", district: "TL", areaHa: "5.00", crop: "Wheat", season: "Rabi 2026", entitlementQtl: "100",
  });
  userIds.push(u!.id);
  const res = await book({ userId: u!.id, slotId, qtl: 10, trolleys: 1 });
  refs.push(res.booking.ref);
  gateOtps[res.booking.ref] = res.gateOtp!;
  return { userId: u!.id, ref: res.booking.ref };
}

beforeAll(async () => {
  await db.delete(t.centres).where(eq(t.centres.code, CODE));
  // self-heal prefix +9198111: clear farmers left by an interrupted prior run
  {
    const stale = await db.select({ id: t.users.id }).from(t.users).where(raw`${t.users.mobile} like ${'+9198111%'}`);
    const ids = stale.map((u) => u.id);
    if (ids.length) {
      await db.delete(t.auditLog).where(inArray(t.auditLog.actorId, ids));
      await db.delete(t.messages).where(inArray(t.messages.userId, ids));
      await db.delete(t.holdings).where(inArray(t.holdings.userId, ids));
      await db.delete(t.users).where(inArray(t.users.id, ids));
    }
  }
  const [centre] = await db.insert(t.centres).values({
    code: CODE, name: "Queue Flow Centre", district: "TL", lat: "30", lng: "75", lanes: 1,
    weighbridgeQtlDay: 9999, gunnyBags: 99999, godownFreeQtl: 9999, qtlPerBag: "0.50",
  }).returning();
  centreId = centre!.id;
  const [op] = await db.insert(t.users).values({
    mobile: "+919811199999", name: "Flow Operator", language: "en", role: "operator", centreId,
  }).returning();
  operatorId = op!.id;
});

afterAll(async () => {
  await db.delete(t.serviceEvents).where(eq(t.serviceEvents.centreId, centreId));
  await db.delete(t.queueNotifies).where(eq(t.queueNotifies.centreId, centreId));
  await db.delete(t.tokens).where(eq(t.tokens.centreId, centreId));
  await db.delete(t.bookings).where(eq(t.bookings.centreId, centreId));
  const days = await db.select({ id: t.centreDays.id }).from(t.centreDays).where(eq(t.centreDays.centreId, centreId));
  for (const d of days) await db.delete(t.slots).where(eq(t.slots.centreDayId, d.id));
  await db.delete(t.centreDays).where(eq(t.centreDays.centreId, centreId));
  const all = [...userIds, operatorId];
  await db.delete(t.auditLog).where(inArray(t.auditLog.actorId, all));
  await db.delete(t.holdings).where(inArray(t.holdings.userId, all));
  await db.delete(t.messages).where(inArray(t.messages.userId, all));
  await db.delete(t.users).where(inArray(t.users.id, all));
  await db.delete(t.centres).where(eq(t.centres.id, centreId));
  await sql.end();
});

beforeEach(async () => {
  // fresh day + two windows
  await db.delete(t.serviceEvents).where(eq(t.serviceEvents.centreId, centreId));
  await db.delete(t.queueNotifies).where(eq(t.queueNotifies.centreId, centreId));
  await db.delete(t.tokens).where(eq(t.tokens.centreId, centreId));
  await db.delete(t.bookings).where(eq(t.bookings.centreId, centreId));
  const days = await db.select({ id: t.centreDays.id }).from(t.centreDays).where(eq(t.centreDays.centreId, centreId));
  for (const d of days) await db.delete(t.slots).where(eq(t.slots.centreDayId, d.id));
  await db.delete(t.centreDays).where(eq(t.centreDays.centreId, centreId));
  if (userIds.length) await db.update(t.holdings).set({ usedQtl: "0" }).where(inArray(t.holdings.userId, userIds));
  refs.length = 0;

  const today = istDate();
  const [day] = await db.insert(t.centreDays).values({
    centreId, date: today, capacityQtl: 1000, capacityTrolleys: 40, poolsReleasedAt: new Date(),
  }).returning();
  dayId = day!.id;
  const [e] = await db.insert(t.slots).values({
    centreDayId: dayId, windowStart: new Date(`${today}T08:00:00+05:30`), windowEnd: new Date(`${today}T10:00:00+05:30`),
    capacityTrolleys: 20, capacityQtl: 500,
  }).returning();
  const [l] = await db.insert(t.slots).values({
    centreDayId: dayId, windowStart: new Date(`${today}T10:00:00+05:30`), windowEnd: new Date(`${today}T12:00:00+05:30`),
    capacityTrolleys: 20, capacityQtl: 500,
  }).returning();
  slotEarly = e!.id; slotLate = l!.id;
});

describe("gate check-in", () => {
  it("turns a booking into a token with the right gate OTP", async () => {
    const { ref } = await makeFarmerBooking(1, slotEarly);
    const tok = await checkin({
      operatorId, operatorRole: "operator", operatorCentreId: centreId,
      bookingRef: ref, gateOtp: gateOtps[ref]!, vehicleNo: "PB10AB1234", lane: 1,
    });
    expect(tok.seq).toBe(1);
    expect(tok.tokenNumber).toBe("001");

    const [b] = await db.select().from(t.bookings).where(eq(t.bookings.ref, ref));
    expect(b!.status).toBe("checked_in");
    expect(b!.vehicleNo).toBe("PB10AB1234");
  });

  it("refuses a wrong gate OTP — the anti-resale check", async () => {
    const { ref } = await makeFarmerBooking(2, slotEarly);
    await expect(checkin({
      operatorId, operatorRole: "operator", operatorCentreId: centreId,
      bookingRef: ref, gateOtp: "0000", vehicleNo: "PB10AB1234",
    })).rejects.toMatchObject({ code: "GATE_OTP_INVALID" });
  });

  it("will not check the same booking in twice", async () => {
    const { ref } = await makeFarmerBooking(3, slotEarly);
    const args = { operatorId, operatorRole: "operator" as const, operatorCentreId: centreId, bookingRef: ref, gateOtp: gateOtps[ref]!, vehicleNo: "PB1" };
    await checkin(args);
    await expect(checkin(args)).rejects.toMatchObject({ code: "ALREADY_CHECKED_IN" });
  });

  it("is idempotent on clientUuid for an offline replay", async () => {
    const { ref } = await makeFarmerBooking(4, slotEarly);
    const uuid = crypto.randomUUID();
    const a = await checkin({ operatorId, operatorRole: "operator", operatorCentreId: centreId, bookingRef: ref, gateOtp: gateOtps[ref]!, vehicleNo: "PB1", clientUuid: uuid });
    const b = await checkin({ operatorId, operatorRole: "operator", operatorCentreId: centreId, bookingRef: ref, gateOtp: gateOtps[ref]!, vehicleNo: "PB1", clientUuid: uuid });
    expect(b.seq).toBe(a.seq);
    const count = await db.select().from(t.tokens).where(eq(t.tokens.bookingId,
      (await db.select().from(t.bookings).where(eq(t.bookings.ref, ref)))[0]!.id));
    expect(count).toHaveLength(1);
  });
});

describe("serve next moves the line", () => {
  async function checkIn(ref: string, lane?: number) {
    return checkin({ operatorId, operatorRole: "operator", operatorCentreId: centreId, bookingRef: ref, gateOtp: gateOtps[ref]!, vehicleNo: "PB10XX0000", lane });
  }

  it("serves in published order and updates the farmer snapshot + board", async () => {
    const f1 = await makeFarmerBooking(10, slotEarly);
    const f2 = await makeFarmerBooking(11, slotEarly);
    const f3 = await makeFarmerBooking(12, slotEarly);
    await checkIn(f1.ref); await checkIn(f2.ref); await checkIn(f3.ref);

    // Before serving: three in line, none served.
    let b = await board(centreId);
    expect(b.inLine).toBe(3);
    expect(b.servedToday).toBe(0);

    // f2 sees one ahead served (f1) plus... let's check f2's position.
    let q2 = await farmerQueue(f2.userId);
    expect(q2!.queue.farmersAhead).toBe(1); // f1 ahead

    // Operator serves once → starts f1.
    let r = await serveNext({ operatorId, centreId, lane: 1 });
    expect(r.nowServing).toBe(1);

    // Serve again → finishes f1, starts f2.
    r = await serveNext({ operatorId, centreId, lane: 1 });
    expect(r.finished).toBe(1);
    expect(r.nowServing).toBe(2);

    b = await board(centreId);
    expect(b.servedToday).toBe(1);
    expect(b.nowServing).toBe(2);

    // f3 now has one genuinely ahead (f2, being served); f1 is gone.
    const q3 = await farmerQueue(f3.userId);
    expect(q3!.queue.nowServing).toBe(2);
    expect(q3!.queue.farmersAhead).toBe(1);
  });

  it("keeps an early-window latecomer ahead of a later window", async () => {
    // f_late books the 10am window but checks in FIRST; f_early books 8am, checks in after.
    const fLate = await makeFarmerBooking(20, slotLate);
    const fEarly = await makeFarmerBooking(21, slotEarly);
    await checkIn(fLate.ref);   // seq 1, but 10am window
    await checkIn(fEarly.ref);  // seq 2, but 8am window

    // Serve once: the 8am farmer must go first despite the later token number.
    const r = await serveNext({ operatorId, centreId, lane: 1 });
    expect(r.nowServing).toBe(2); // the 8am (seq 2) is served before the 10am (seq 1)
  });
});

describe("ring my phone", () => {
  it("fires the 5-away SMS when the farmer's turn comes within threshold", async () => {
    // Build a line of 4; target is last. Threshold 2.
    const farmers = [];
    for (let i = 30; i < 34; i++) farmers.push(await makeFarmerBooking(i, slotEarly));
    async function ci(ref: string) { return checkin({ operatorId, operatorRole: "operator", operatorCentreId: centreId, bookingRef: ref, gateOtp: gateOtps[ref]!, vehicleNo: "PB1" }); }
    for (const f of farmers) await ci(f.ref);

    const target = farmers[3]!;
    await registerNotify(target.userId, 2, "sms");

    // 3 ahead → not yet. Serve until within 2.
    await serveNext({ operatorId, centreId, lane: 1 }); // start f0
    let msgs = await db.select().from(t.messages).where(and(eq(t.messages.userId, target.userId), eq(t.messages.templateId, "queue_five_away")));
    expect(msgs.length).toBe(0);

    await serveNext({ operatorId, centreId, lane: 1 }); // finish f0, start f1 → target now 2 away
    msgs = await db.select().from(t.messages).where(and(eq(t.messages.userId, target.userId), eq(t.messages.templateId, "queue_five_away")));
    expect(msgs.length).toBe(1);

    // Does not ring twice.
    await serveNext({ operatorId, centreId, lane: 1 });
    msgs = await db.select().from(t.messages).where(and(eq(t.messages.userId, target.userId), eq(t.messages.templateId, "queue_five_away")));
    expect(msgs.length).toBe(1);
  });
});

describe("anonymised ledger", () => {
  it("exposes the order and outcomes with no farmer identity", async () => {
    const f1 = await makeFarmerBooking(40, slotEarly);
    await checkin({ operatorId, operatorRole: "operator", operatorCentreId: centreId, bookingRef: f1.ref, gateOtp: gateOtps[f1.ref]!, vehicleNo: "PB1" });
    const l = await ledger(centreId);
    expect(l.entries).toHaveLength(1);
    expect(l.entries[0]).toMatchObject({ token: "001", status: "waiting" });
    // no name / mobile / userId anywhere in the payload
    expect(JSON.stringify(l)).not.toMatch(/mobile|userId|name/i);
  });
});
