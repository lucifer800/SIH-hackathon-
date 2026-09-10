/**
 * THE L6 GATE.
 *
 * The network drops at the mandi. The operator checks farmers in and serves the
 * line from the offline console, which records each action to a local outbox with
 * a client UUID. On reconnect the whole outbox is replayed — and if the response
 * is lost, replayed again. Every action must land exactly once, in order, with no
 * duplicate token number.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, asc, eq, inArray, sql as raw } from "drizzle-orm";
import { db, sql } from "../src/db/client.js";
import * as t from "../src/db/schema.js";
import { book } from "../src/modules/bookings/service.js";
import { applyBatch, dayPack, type SyncOp } from "../src/modules/sync/service.js";
import { istDate } from "../src/domain/capacity.js";
import crypto from "node:crypto";

const CODE = "offline-sync-centre";
let centreId = "", operatorId = "", slotId = "";
const userIds: string[] = [];
const gate: Record<string, string> = {};

async function farmerBooking(i: number) {
  const [u] = await db.insert(t.users).values({ mobile: `+9198444${String(i).padStart(5, "0")}`, name: `OFarmer ${i}`, language: "en", role: "farmer" }).returning();
  await db.insert(t.holdings).values({ userId: u!.id, village: "T", district: "OL", areaHa: "5.00", crop: "Wheat", season: "Rabi 2026", entitlementQtl: "100" });
  userIds.push(u!.id);
  const res = await book({ userId: u!.id, slotId, qtl: 20, trolleys: 1 });
  gate[res.booking.ref] = res.gateOtp!;
  return res.booking.ref;
}

beforeAll(async () => {
  await db.delete(t.centres).where(eq(t.centres.code, CODE));
  // self-heal prefix +9198444: clear farmers left by an interrupted prior run
  {
    const stale = await db.select({ id: t.users.id }).from(t.users).where(raw`${t.users.mobile} like ${'+9198444%'}`);
    const ids = stale.map((u) => u.id);
    if (ids.length) {
      await db.delete(t.auditLog).where(inArray(t.auditLog.actorId, ids));
      await db.delete(t.messages).where(inArray(t.messages.userId, ids));
      await db.delete(t.holdings).where(inArray(t.holdings.userId, ids));
      await db.delete(t.users).where(inArray(t.users.id, ids));
    }
  }
  const [stale] = await db.select().from(t.users).where(eq(t.users.mobile, "+919844499999")).limit(1);
  if (stale) { await db.delete(t.auditLog).where(eq(t.auditLog.actorId, stale.id)); await db.delete(t.users).where(eq(t.users.id, stale.id)); }
  const [c] = await db.insert(t.centres).values({ code: CODE, name: "Offline Sync Centre", district: "OL", lat: "30", lng: "75", lanes: 1, weighbridgeQtlDay: 9999, gunnyBags: 99999, godownFreeQtl: 9999, qtlPerBag: "0.50" }).returning();
  centreId = c!.id;
  const [op] = await db.insert(t.users).values({ mobile: "+919844499999", name: "Offline Operator", language: "en", role: "operator", centreId }).returning();
  operatorId = op!.id;
});

afterAll(async () => {
  await db.delete(t.serviceEvents).where(eq(t.serviceEvents.centreId, centreId));
  await db.delete(t.tokens).where(eq(t.tokens.centreId, centreId));
  await db.delete(t.bookings).where(eq(t.bookings.centreId, centreId));
  const days = await db.select({ id: t.centreDays.id }).from(t.centreDays).where(eq(t.centreDays.centreId, centreId));
  for (const d of days) await db.delete(t.slots).where(eq(t.slots.centreDayId, d.id));
  await db.delete(t.centreDays).where(eq(t.centreDays.centreId, centreId));
  const all = [...userIds, operatorId];
  await db.delete(t.auditLog).where(inArray(t.auditLog.actorId, all));
  await db.delete(t.idempotencyKeys).where(inArray(t.idempotencyKeys.userId, all));
  await db.delete(t.holdings).where(inArray(t.holdings.userId, all));
  await db.delete(t.messages).where(inArray(t.messages.userId, all));
  await db.delete(t.users).where(inArray(t.users.id, all));
  await db.delete(t.centres).where(eq(t.centres.id, centreId));
  await sql.end();
});

beforeEach(async () => {
  await db.delete(t.serviceEvents).where(eq(t.serviceEvents.centreId, centreId));
  await db.delete(t.tokens).where(eq(t.tokens.centreId, centreId));
  await db.delete(t.bookings).where(eq(t.bookings.centreId, centreId));
  const days = await db.select({ id: t.centreDays.id }).from(t.centreDays).where(eq(t.centreDays.centreId, centreId));
  for (const d of days) await db.delete(t.slots).where(eq(t.slots.centreDayId, d.id));
  await db.delete(t.centreDays).where(eq(t.centreDays.centreId, centreId));
  if (userIds.length) {
    await db.delete(t.idempotencyKeys).where(inArray(t.idempotencyKeys.userId, [...userIds, operatorId]));
    await db.update(t.holdings).set({ usedQtl: "0" }).where(inArray(t.holdings.userId, userIds));
  }
  const today = istDate();
  const [day] = await db.insert(t.centreDays).values({ centreId, date: today, capacityQtl: 1000, capacityTrolleys: 40, poolsReleasedAt: new Date() }).returning();
  const [s] = await db.insert(t.slots).values({ centreDayId: day!.id, windowStart: new Date(`${today}T08:00:00+05:30`), windowEnd: new Date(`${today}T10:00:00+05:30`), capacityTrolleys: 40, capacityQtl: 1000 }).returning();
  slotId = s!.id;
});

describe("offline replay", () => {
  it("applies three offline check-ins exactly once, even when replayed twice", async () => {
    const refs = [await farmerBooking(1), await farmerBooking(2), await farmerBooking(3)];
    const base = Date.now();
    const ops: SyncOp[] = refs.map((ref, i) => ({
      clientUuid: crypto.randomUUID(), type: "checkin", bookingRef: ref, gateOtp: gate[ref]!,
      vehicleNo: `PB10AA000${i}`, lane: 1, at: new Date(base + i * 1000).toISOString(),
    }));

    const first = await applyBatch({ operatorId, operatorRole: "operator", operatorCentreId: centreId, centreId, date: istDate(), operations: ops });
    expect(first.results.every((r) => r.ok && !r.replayed)).toBe(true);

    // Connection dropped before the console saw the response → it replays the same outbox.
    const second = await applyBatch({ operatorId, operatorRole: "operator", operatorCentreId: centreId, centreId, date: istDate(), operations: ops });
    expect(second.results.every((r) => r.ok && r.replayed)).toBe(true);

    // Exactly three tokens, numbered 1..3, no duplicates.
    const tokens = await db.select().from(t.tokens).where(eq(t.tokens.centreId, centreId)).orderBy(asc(t.tokens.seq));
    expect(tokens).toHaveLength(3);
    expect(tokens.map((tk) => tk.seq)).toEqual([1, 2, 3]);
    expect(new Set(tokens.map((tk) => tk.seq)).size).toBe(3);
  });

  it("preserves the real arrival order via the client timestamp", async () => {
    const refA = await farmerBooking(10);
    const refB = await farmerBooking(11);
    const base = Date.now();
    // B arrived first offline, A second — the outbox order and timestamps reflect that.
    const ops: SyncOp[] = [
      { clientUuid: crypto.randomUUID(), type: "checkin", bookingRef: refB, gateOtp: gate[refB]!, vehicleNo: "PB1B", lane: 1, at: new Date(base).toISOString() },
      { clientUuid: crypto.randomUUID(), type: "checkin", bookingRef: refA, gateOtp: gate[refA]!, vehicleNo: "PB1A", lane: 1, at: new Date(base + 5000).toISOString() },
    ];
    await applyBatch({ operatorId, operatorRole: "operator", operatorCentreId: centreId, centreId, date: istDate(), operations: ops });

    const tokens = await db.select().from(t.tokens).where(eq(t.tokens.centreId, centreId)).orderBy(asc(t.tokens.checkedInAt));
    // First checked-in (B) sorts first by checkedInAt.
    const [b] = await db.select().from(t.bookings).where(eq(t.bookings.ref, refB));
    expect(tokens[0]!.bookingId).toBe(b!.id);
  });

  it("reports a bad operation without aborting the rest of the batch", async () => {
    const good = await farmerBooking(20);
    const ops: SyncOp[] = [
      { clientUuid: crypto.randomUUID(), type: "checkin", bookingRef: good, gateOtp: gate[good]!, vehicleNo: "PB1G", lane: 1 },
      { clientUuid: crypto.randomUUID(), type: "checkin", bookingRef: good, gateOtp: "0000", vehicleNo: "PB1X", lane: 1 }, // wrong OTP
    ];
    const res = await applyBatch({ operatorId, operatorRole: "operator", operatorCentreId: centreId, centreId, date: istDate(), operations: ops });
    expect(res.results[0]!.ok).toBe(true);
    expect(res.results[1]!.ok).toBe(false);
    expect(res.results[1]!.error!.code).toMatch(/GATE_OTP_INVALID|ALREADY_CHECKED_IN/);
  });

  it("gives the console a day pack to run offline", async () => {
    const ref = await farmerBooking(30);
    const pack = await dayPack(centreId, istDate());
    expect(pack.centre.name).toBe("Offline Sync Centre");
    expect(pack.bookings.some((b) => b.ref === ref)).toBe(true);
    // Gate OTPs must NOT be in the pack — they stay hashed on the server.
    expect(JSON.stringify(pack)).not.toMatch(/gateOtp|gate_otp/i);
  });
});
