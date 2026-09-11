/**
 * L7 — Trust & operations: grievances tied to a lot, the no-show sweeper returning
 * a seat and dropping priority, the impact read-model over real rows, and the
 * farmer dashboard aggregate.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, eq, inArray, sql as raw } from "drizzle-orm";
import { db, sql } from "../src/db/client.js";
import * as t from "../src/db/schema.js";
import { book } from "../src/modules/bookings/service.js";
import { checkin } from "../src/modules/queue/service.js";
import { recordLot } from "../src/modules/lots/service.js";
import { fileGrievance, listMine, resolve } from "../src/modules/grievances/service.js";
import { sweepNoShows, releaseExpiredHolds } from "../src/modules/maintenance/service.js";
import { impact } from "../src/modules/district/service.js";
import { dashboard } from "../src/modules/dashboard/service.js";
import { istDate } from "../src/domain/capacity.js";

const CODE = "trust-flow-centre";
const DISTRICT = "TrustLand";
let centreId = "", operatorId = "", districtId = "", slotPast = "", slotToday = "";
const userIds: string[] = [];
const gate: Record<string, string> = {};

async function farmer(i: number) {
  const [u] = await db.insert(t.users).values({ mobile: `+9198555${String(i).padStart(5, "0")}`, name: `TFarmer ${i}`, language: "pa", role: "farmer" }).returning();
  await db.insert(t.holdings).values({ userId: u!.id, village: "T", district: DISTRICT, areaHa: "5.00", crop: "Wheat", season: "Rabi 2026", entitlementQtl: "100" });
  userIds.push(u!.id);
  return u!.id;
}

beforeAll(async () => {
  await db.delete(t.centres).where(eq(t.centres.code, CODE));
  const stale = await db.select({ id: t.users.id }).from(t.users).where(raw`${t.users.mobile} like ${'+9198555%'}`);
  const sids = stale.map((u) => u.id);
  if (sids.length) { await db.delete(t.auditLog).where(inArray(t.auditLog.actorId, sids)); await db.delete(t.users).where(inArray(t.users.id, sids)); }
  const [c] = await db.insert(t.centres).values({ code: CODE, name: "Trust Flow Centre", district: DISTRICT, lat: "30", lng: "75", lanes: 1, weighbridgeQtlDay: 9999, gunnyBags: 99999, godownFreeQtl: 9999, qtlPerBag: "0.50" }).returning();
  centreId = c!.id;
  const [op] = await db.insert(t.users).values({ mobile: "+919855599998", name: "Trust Operator", language: "en", role: "operator", centreId }).returning();
  const [dc] = await db.insert(t.users).values({ mobile: "+919855599999", name: "Trust District", language: "en", role: "district", district: DISTRICT }).returning();
  operatorId = op!.id; districtId = dc!.id;
});

afterAll(async () => {
  await db.delete(t.grievances).where(inArray(t.grievances.userId, userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]));
  await db.delete(t.serviceEvents).where(eq(t.serviceEvents.centreId, centreId));
  await db.delete(t.tokens).where(eq(t.tokens.centreId, centreId));
  const lotIds = (await db.select({ id: t.lots.id }).from(t.lots).where(eq(t.lots.centreId, centreId))).map((r) => r.id);
  if (lotIds.length) await db.delete(t.payments).where(inArray(t.payments.lotId, lotIds));
  await db.delete(t.lots).where(eq(t.lots.centreId, centreId));
  await db.delete(t.bookings).where(eq(t.bookings.centreId, centreId));
  const days = await db.select({ id: t.centreDays.id }).from(t.centreDays).where(eq(t.centreDays.centreId, centreId));
  for (const d of days) await db.delete(t.slots).where(eq(t.slots.centreDayId, d.id));
  await db.delete(t.centreDays).where(eq(t.centreDays.centreId, centreId));
  const all = [...userIds, operatorId, districtId];
  await db.delete(t.auditLog).where(inArray(t.auditLog.actorId, all));
  await db.delete(t.holdings).where(inArray(t.holdings.userId, all));
  await db.delete(t.messages).where(inArray(t.messages.userId, all));
  await db.delete(t.users).where(inArray(t.users.id, all));
  await db.delete(t.centres).where(eq(t.centres.id, centreId));
  await sql.end();
});

beforeEach(async () => {
  await db.delete(t.grievances).where(inArray(t.grievances.userId, userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]));
  await db.delete(t.serviceEvents).where(eq(t.serviceEvents.centreId, centreId));
  await db.delete(t.tokens).where(eq(t.tokens.centreId, centreId));
  const lotIds = (await db.select({ id: t.lots.id }).from(t.lots).where(eq(t.lots.centreId, centreId))).map((r) => r.id);
  if (lotIds.length) await db.delete(t.payments).where(inArray(t.payments.lotId, lotIds));
  await db.delete(t.lots).where(eq(t.lots.centreId, centreId));
  await db.delete(t.bookings).where(eq(t.bookings.centreId, centreId));
  const days = await db.select({ id: t.centreDays.id }).from(t.centreDays).where(eq(t.centreDays.centreId, centreId));
  for (const d of days) await db.delete(t.slots).where(eq(t.slots.centreDayId, d.id));
  await db.delete(t.centreDays).where(eq(t.centreDays.centreId, centreId));
  if (userIds.length) await db.update(t.holdings).set({ usedQtl: "0" }).where(inArray(t.holdings.userId, userIds));
  await db.update(t.users).set({ priorityScore: 100, noShowCount: 0 }).where(inArray(t.users.id, userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]));

  const today = istDate();
  const [dayT] = await db.insert(t.centreDays).values({ centreId, date: today, capacityQtl: 1000, capacityTrolleys: 40, poolsReleasedAt: new Date() }).returning();
  const [st] = await db.insert(t.slots).values({ centreDayId: dayT!.id, windowStart: new Date(`${today}T08:00:00+05:30`), windowEnd: new Date(`${today}T10:00:00+05:30`), capacityTrolleys: 40, capacityQtl: 1000 }).returning();
  slotToday = st!.id;
});

describe("grievances tied to a lot", () => {
  it("files a grievance against the farmer's own receipt and lets the district resolve it", async () => {
    const fid = await farmer(1);
    const b = await book({ userId: fid, slotId: slotToday, qtl: 20, trolleys: 1 });
    await checkin({ operatorId, operatorRole: "operator", operatorCentreId: centreId, bookingRef: b.booking.ref, gateOtp: b.gateOtp!, vehicleNo: "PB1" });
    const lot = await recordLot({ operatorId, operatorRole: "operator", operatorCentreId: centreId, bookingRef: b.booking.ref, moisturePct: 11, grossQtl: 20.4, tareQtl: 0.4 });

    const g = await fileGrievance({ userId: fid, language: "pa", category: "weighment", body: "Net weight looks low", receiptNo: lot.receiptNo });
    expect(g.ref).toMatch(/^GRV-/);
    expect(g.lotId).toBeTruthy();          // tied to the lot id — the governance promise
    expect(g.status).toBe("open");

    const resolved = await resolve(districtId, g.ref, "Re-weighed; correct. Explained to farmer.");
    expect(resolved.status).toBe("resolved");
    expect((await listMine(fid))[0]!.status).toBe("resolved");
  });

  it("refuses a grievance against a receipt that is not the farmer's", async () => {
    const a = await farmer(2); const other = await farmer(3);
    const b = await book({ userId: a, slotId: slotToday, qtl: 20, trolleys: 1 });
    await checkin({ operatorId, operatorRole: "operator", operatorCentreId: centreId, bookingRef: b.booking.ref, gateOtp: b.gateOtp!, vehicleNo: "PB1" });
    const lot = await recordLot({ operatorId, operatorRole: "operator", operatorCentreId: centreId, bookingRef: b.booking.ref, moisturePct: 11, grossQtl: 20.4, tareQtl: 0.4 });
    await expect(fileGrievance({ userId: other, language: "pa", category: "weighment", body: "x", receiptNo: lot.receiptNo }))
      .rejects.toMatchObject({ code: "UNKNOWN_RECEIPT" });
  });
});

describe("no-show sweeper", () => {
  it("marks a no-show, returns the seat and entitlement, and drops priority", async () => {
    const fid = await farmer(10);
    // A booking in a window that has already closed (yesterday).
    const past = istDate(new Date(Date.now() - 86_400_000));
    const [dayP] = await db.insert(t.centreDays).values({ centreId, date: past, capacityQtl: 500, capacityTrolleys: 20, poolsReleasedAt: new Date(), status: "open" }).returning();
    const [sp] = await db.insert(t.slots).values({ centreDayId: dayP!.id, windowStart: new Date(`${past}T08:00:00+05:30`), windowEnd: new Date(`${past}T10:00:00+05:30`), capacityTrolleys: 20, capacityQtl: 500 }).returning();
    const b = await book({ userId: fid, slotId: sp!.id, qtl: 20, trolleys: 1 });

    const [slotBefore] = await db.select().from(t.slots).where(eq(t.slots.id, sp!.id));
    expect(slotBefore!.bookedTrolleys).toBe(1);

    const { swept } = await sweepNoShows();
    expect(swept).toBeGreaterThanOrEqual(1);

    const [after] = await db.select().from(t.bookings).where(eq(t.bookings.ref, b.booking.ref));
    expect(after!.status).toBe("no_show");
    const [slotAfter] = await db.select().from(t.slots).where(eq(t.slots.id, sp!.id));
    expect(slotAfter!.bookedTrolleys).toBe(0);                 // seat returned
    const [u] = await db.select().from(t.users).where(eq(t.users.id, fid));
    expect(u!.priorityScore).toBe(85);                          // 100 - 15
    expect(u!.noShowCount).toBe(1);
    const [h] = await db.select().from(t.holdings).where(eq(t.holdings.userId, fid));
    expect(Number(h!.usedQtl)).toBe(0);                         // entitlement returned
  });

  it("does not sweep a booking whose window is still open", async () => {
    const fid = await farmer(11);
    // Create a slot that ends far in the future so it's always "still open"
    const tomorrow = new Date(Date.now() + 24 * 3600_000).toISOString().slice(0, 10);
    const [dayF] = await db.insert(t.centreDays).values({ centreId, date: tomorrow, capacityQtl: 1000, capacityTrolleys: 40, poolsReleasedAt: new Date() }).returning();
    const [futureSlot] = await db.insert(t.slots).values({ centreDayId: dayF!.id, windowStart: new Date(Date.now() + 3600_000), windowEnd: new Date(Date.now() + 7200_000), capacityTrolleys: 40, capacityQtl: 1000 }).returning();
    await book({ userId: fid, slotId: futureSlot!.id, qtl: 20, trolleys: 1 });
    const { swept } = await sweepNoShows();
    const [u] = await db.select().from(t.users).where(eq(t.users.id, fid));
    expect(u!.noShowCount).toBe(0);
  });
});

describe("expired holds", () => {
  it("releases a hold past its 6-hour window", async () => {
    const fid = await farmer(20);
    await db.insert(t.slotHolds).values({ slotId: slotToday, userId: fid, trolleys: 1, qtl: "20", reason: "rain_reschedule", expiresAt: new Date(Date.now() - 1000) });
    const { released } = await releaseExpiredHolds();
    expect(released).toBeGreaterThanOrEqual(1);
    const [h] = await db.select().from(t.slotHolds).where(eq(t.slotHolds.userId, fid));
    expect(h!.releasedAt).not.toBeNull();
  });
});

describe("impact read-model", () => {
  it("reports the four deck numbers from real rows", async () => {
    const fid = await farmer(30);
    const b = await book({ userId: fid, slotId: slotToday, qtl: 20, trolleys: 1 });
    await checkin({ operatorId, operatorRole: "operator", operatorCentreId: centreId, bookingRef: b.booking.ref, gateOtp: b.gateOtp!, vehicleNo: "PB1" });

    const r = await impact(DISTRICT);
    expect(r.targets.medianWaitMinutes).toBe(90);
    expect(r.measured).not.toBeNull();
    expect(r.measured!).toHaveProperty("peakToAverage");
    expect(r.measured!).toHaveProperty("knewTheirTurnPct");
  });
});

describe("farmer dashboard aggregate", () => {
  it("returns profile, next appointment, queue, value and unread in one call", async () => {
    const fid = await farmer(40);
    const b = await book({ userId: fid, slotId: slotToday, qtl: 20, trolleys: 1 });
    const d = await dashboard(fid);
    expect(d.user!.name).toBe("TFarmer 40");
    expect(d.holding!.entitlementQtl).toBe(100);
    expect(d.appointment!.ref).toBe(b.booking.ref);
    expect(d).toHaveProperty("procurementValue");
    expect(d).toHaveProperty("unreadNotifications");
  });
});
