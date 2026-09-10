/**
 * L5 gate: rain closes a day → each not-yet-arrived farmer gets a reply-by-digit
 * offer with a HELD slot → the farmer replies "1" (inbound SMS webhook) → their
 * booking moves onto the held slot. Plus rates, the voice assist over live data,
 * and the district read-model.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, eq, inArray, sql as raw } from "drizzle-orm";
import { db, sql } from "../src/db/client.js";
import * as t from "../src/db/schema.js";
import { book } from "../src/modules/bookings/service.js";
import { declareEvent, acceptLatestOffer } from "../src/modules/disruption/service.js";
import { ask } from "../src/modules/assist/service.js";
import { ratesFor, seedRates } from "../src/modules/rates/service.js";
import { overview } from "../src/modules/district/service.js";
import { istDate, addDays } from "../src/domain/capacity.js";

const CODE = "reach-flow-centre";
const DISTRICT = "ReachLand";
let centreId = "", operatorId = "";
const userIds: string[] = [];

async function farmer(i: number, lang: "pa" | "hi" | "en" = "pa") {
  const [u] = await db.insert(t.users).values({ mobile: `+9198333${String(i).padStart(5, "0")}`, name: `RFarmer ${i}`, language: lang, role: "farmer" }).returning();
  await db.insert(t.holdings).values({ userId: u!.id, village: "T", district: DISTRICT, areaHa: "5.00", crop: "Wheat", season: "Rabi 2026", entitlementQtl: "100" });
  userIds.push(u!.id);
  return u!.id;
}
async function slotOn(date: string) {
  await db.insert(t.centreDays).values({ centreId, date, capacityQtl: 500, capacityTrolleys: 20, poolsReleasedAt: new Date(), status: "open" }).onConflictDoNothing();
  const [day] = await db.select().from(t.centreDays).where(and(eq(t.centreDays.centreId, centreId), eq(t.centreDays.date, date)));
  const existing = await db.select().from(t.slots).where(eq(t.slots.centreDayId, day!.id));
  if (existing[0]) return existing[0].id;
  const [s] = await db.insert(t.slots).values({ centreDayId: day!.id, windowStart: new Date(`${date}T08:00:00+05:30`), windowEnd: new Date(`${date}T10:00:00+05:30`), capacityTrolleys: 20, capacityQtl: 500 }).returning();
  return s!.id;
}

beforeAll(async () => {
  await db.delete(t.centres).where(eq(t.centres.code, CODE));
  // self-heal prefix +9198333: clear farmers left by an interrupted prior run
  {
    const stale = await db.select({ id: t.users.id }).from(t.users).where(raw`${t.users.mobile} like ${'+9198333%'}`);
    const ids = stale.map((u) => u.id);
    if (ids.length) {
      await db.delete(t.auditLog).where(inArray(t.auditLog.actorId, ids));
      await db.delete(t.messages).where(inArray(t.messages.userId, ids));
      await db.delete(t.holdings).where(inArray(t.holdings.userId, ids));
      await db.delete(t.users).where(inArray(t.users.id, ids));
    }
  }
  const [c] = await db.insert(t.centres).values({ code: CODE, name: "Reach Flow Centre", district: DISTRICT, lat: "30", lng: "75", lanes: 2, weighbridgeQtlDay: 9999, gunnyBags: 99999, godownFreeQtl: 9999, qtlPerBag: "0.50" }).returning();
  centreId = c!.id;
  const [op] = await db.insert(t.users).values({ mobile: "+919833399999", name: "Reach Operator", language: "en", role: "operator", centreId }).returning();
  operatorId = op!.id;
});

afterAll(async () => {
  await db.delete(t.slotHolds).where(inArray(t.slotHolds.userId, userIds));
  await db.delete(t.pendingDecisions).where(inArray(t.pendingDecisions.userId, userIds));
  await db.delete(t.bookings).where(eq(t.bookings.centreId, centreId));
  await db.delete(t.centreEvents).where(eq(t.centreEvents.centreId, centreId));
  const days = await db.select({ id: t.centreDays.id }).from(t.centreDays).where(eq(t.centreDays.centreId, centreId));
  for (const d of days) await db.delete(t.slots).where(eq(t.slots.centreDayId, d.id));
  await db.delete(t.centreDays).where(eq(t.centreDays.centreId, centreId));
  await db.delete(t.rates).where(eq(t.rates.district, DISTRICT));
  const all = [...userIds, operatorId];
  await db.delete(t.auditLog).where(inArray(t.auditLog.actorId, all));
  await db.delete(t.holdings).where(inArray(t.holdings.userId, all));
  await db.delete(t.messages).where(inArray(t.messages.userId, all));
  await db.delete(t.users).where(inArray(t.users.id, all));
  await db.delete(t.centres).where(eq(t.centres.id, centreId));
  await sql.end();
});

beforeEach(async () => {
  await db.delete(t.slotHolds).where(inArray(t.slotHolds.userId, userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]));
  await db.delete(t.pendingDecisions).where(inArray(t.pendingDecisions.userId, userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]));
  await db.delete(t.bookings).where(eq(t.bookings.centreId, centreId));
  await db.delete(t.centreEvents).where(eq(t.centreEvents.centreId, centreId));
  const days = await db.select({ id: t.centreDays.id }).from(t.centreDays).where(eq(t.centreDays.centreId, centreId));
  for (const d of days) await db.delete(t.slots).where(eq(t.slots.centreDayId, d.id));
  await db.delete(t.centreDays).where(eq(t.centreDays.centreId, centreId));
  if (userIds.length) await db.update(t.holdings).set({ usedQtl: "0" }).where(inArray(t.holdings.userId, userIds));
});

describe("disruption → reply 1 → booking moves (the L5 gate)", () => {
  it("offers a held future slot and moves the booking on accept", async () => {
    const today = istDate();
    const tomorrow = addDays(today, 1);
    const todaySlot = await slotOn(today);
    const tomorrowSlot = await slotOn(tomorrow);

    const fid = await farmer(1, "pa");
    const original = await book({ userId: fid, slotId: todaySlot, qtl: 20, trolleys: 1 });

    // Rain closes today.
    const res = await declareEvent({ operatorId, centreId, date: today, kind: "rain" });
    expect(res.offersMade).toBe(1);

    // The original booking was cancelled and a hold placed on tomorrow's slot.
    const [orig] = await db.select().from(t.bookings).where(eq(t.bookings.ref, original.booking.ref));
    expect(orig!.status).toBe("cancelled");
    const holds = await db.select().from(t.slotHolds).where(and(eq(t.slotHolds.slotId, tomorrowSlot), eq(t.slotHolds.userId, fid)));
    expect(holds).toHaveLength(1);

    // A reschedule-offer SMS reached the farmer.
    const offer = await db.select().from(t.messages).where(and(eq(t.messages.userId, fid), eq(t.messages.templateId, "reschedule_offer")));
    expect(offer).toHaveLength(1);

    // Farmer replies "1" → books the held slot.
    const moved = await acceptLatestOffer(fid, "sms");
    expect(moved.booking.status).toBe("booked");

    // The hold is now claimed and the decision resolved.
    const claimedHold = await db.select().from(t.slotHolds).where(eq(t.slotHolds.userId, fid));
    expect(claimedHold[0]!.claimedAt).not.toBeNull();
    const decision = await db.select().from(t.pendingDecisions).where(eq(t.pendingDecisions.userId, fid));
    expect(decision[0]!.resolvedAt).not.toBeNull();
  });

  it("a held slot is not bookable by someone else during the first-refusal window", async () => {
    const today = istDate();
    const tomorrow = addDays(today, 1);
    const todaySlot = await slotOn(today);
    // Tomorrow has exactly ONE seat, so the rain hold takes the last one.
    await db.insert(t.centreDays).values({ centreId, date: tomorrow, capacityQtl: 25, capacityTrolleys: 1, poolsReleasedAt: new Date(), status: "open" }).onConflictDoNothing();
    const [tday] = await db.select().from(t.centreDays).where(and(eq(t.centreDays.centreId, centreId), eq(t.centreDays.date, tomorrow)));
    const [ts] = await db.insert(t.slots).values({ centreDayId: tday!.id, windowStart: new Date(`${tomorrow}T08:00:00+05:30`), windowEnd: new Date(`${tomorrow}T10:00:00+05:30`), capacityTrolleys: 1, capacityQtl: 25 }).returning();
    const tomorrowSlot = ts!.id;

    const rained = await farmer(2, "pa");
    await book({ userId: rained, slotId: todaySlot, qtl: 20, trolleys: 1 });
    await declareEvent({ operatorId, centreId, date: today, kind: "rain" }); // holds the last seat for `rained`

    // Another farmer tries the same tomorrow slot — the held seat blocks them.
    const other = await farmer(3, "pa");
    await expect(book({ userId: other, slotId: tomorrowSlot, qtl: 20, trolleys: 1 }))
      .rejects.toMatchObject({ code: "SLOT_FULL" });

    // But the rained-out farmer can take it.
    const moved = await acceptLatestOffer(rained, "sms");
    expect(moved.booking.status).toBe("booked");
  });
});

describe("rates", () => {
  it("returns today's price, a 7-day trend and nearby mandis with advice", async () => {
    await seedRates(DISTRICT, ["Wheat"]);
    const r = await ratesFor("Wheat");
    expect(r.trend.length).toBeGreaterThanOrEqual(1);
    expect(r.today).toBeGreaterThan(0);
    expect(r.nearby.length).toBeGreaterThan(0);
    expect(r.advice).toBeTruthy();
  });
});

describe("voice assist over live data", () => {
  it("answers a turn question when the farmer is not in a queue", async () => {
    const fid = await farmer(10, "en");
    const a = await ask(fid, "how long is my turn", "en");
    expect(a.intent).toBe("turn");
    expect(a.answer).toMatch(/not in a queue/i);
  });
  it("answers a rate question from live rates", async () => {
    await seedRates(DISTRICT, ["Wheat"]);
    const fid = await farmer(11, "en");
    const a = await ask(fid, "what is the wheat rate", "en");
    expect(a.intent).toBe("rate");
    expect(a.answer).toMatch(/Wheat rate is ₹/);
  });
});

describe("district overview", () => {
  it("aggregates capacity, arrivals and payment ageing", async () => {
    const today = istDate();
    await slotOn(today);
    const fid = await farmer(20, "en");
    const slot = (await db.select().from(t.slots).innerJoin(t.centreDays, eq(t.centreDays.id, t.slots.centreDayId)).where(and(eq(t.centreDays.centreId, centreId), eq(t.centreDays.date, today))))[0]!.slots.id;
    await book({ userId: fid, slotId: slot, qtl: 20, trolleys: 1 });

    const o = await overview(DISTRICT, today);
    expect(o.centres.length).toBeGreaterThan(0);
    const c = o.centres.find((x) => x.centreId === centreId)!;
    expect(c.bookedQtl).toBeGreaterThanOrEqual(20);
    expect(o.totals.bookedQtl).toBeGreaterThanOrEqual(20);
    expect(o.payments).toHaveProperty("over48h");
  });
});
