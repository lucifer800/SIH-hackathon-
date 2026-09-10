/**
 * Route-level booking tests: the real HTTP path a farmer takes, including the
 * idempotency guard that a rural double-tap depends on.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq, inArray } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { db, sql } from "../src/db/client.js";
import * as t from "../src/db/schema.js";
import { istDate } from "../src/domain/capacity.js";
import { normaliseMobile } from "../src/lib/mobile.js";

let app: FastifyInstance;
let token = "";
let userId = "";
let centreId = "";
let slotA = "";
let slotB = "";
const MOBILE = "9822200001";
const CODE = "route-test-centre";

async function bootstrapSlots() {
  const today = istDate();
  const [day] = await db.insert(t.centreDays).values({
    centreId, date: today, capacityQtl: 250, capacityTrolleys: 10, poolsReleasedAt: new Date(),
  }).returning();
  const mk = async (h: number) => {
    const [s] = await db.insert(t.slots).values({
      centreDayId: day!.id,
      windowStart: new Date(`${today}T${String(h).padStart(2, "0")}:00:00+05:30`),
      windowEnd: new Date(`${today}T${String(h + 2).padStart(2, "0")}:00:00+05:30`),
      capacityTrolleys: 5, capacityQtl: 125,
    }).returning();
    return s!.id;
  };
  slotA = await mk(8);
  slotB = await mk(10);
}

async function cleanup() {
  const days = await db.select({ id: t.centreDays.id }).from(t.centreDays).where(eq(t.centreDays.centreId, centreId));
  for (const d of days) {
    await db.delete(t.bookings).where(inArray(t.bookings.slotId,
      (await db.select({ id: t.slots.id }).from(t.slots).where(eq(t.slots.centreDayId, d.id))).map((x) => x.id)));
    await db.delete(t.slots).where(eq(t.slots.centreDayId, d.id));
  }
  await db.delete(t.centreDays).where(eq(t.centreDays.centreId, centreId));
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  await db.delete(t.centres).where(eq(t.centres.code, CODE)); // clear any leftover from an interrupted run
  // Clear leftover auth rows so the per-mobile OTP limit is not tripped by a prior run.
  for (const m of ["9822200001", "9822200002"]) {
    const e = normaliseMobile(m);
    await db.delete(t.otpRequests).where(eq(t.otpRequests.mobile, e));
    const [u] = await db.select().from(t.users).where(eq(t.users.mobile, e)).limit(1);
    if (u) {
      await db.delete(t.refreshTokens).where(eq(t.refreshTokens.userId, u.id));
      await db.delete(t.messages).where(eq(t.messages.userId, u.id));
      await db.delete(t.holdings).where(eq(t.holdings.userId, u.id));
      await db.delete(t.users).where(eq(t.users.id, u.id));
    }
  }
  const [centre] = await db.insert(t.centres).values({
    code: CODE, name: "Route Test Centre", district: "TestLand",
    lat: "30.0", lng: "75.0", weighbridgeQtlDay: 9999, gunnyBags: 99999, godownFreeQtl: 9999, qtlPerBag: "0.50",
  }).returning();
  centreId = centre!.id;

  const req = await app.inject({ method: "POST", url: "/api/v1/auth/otp/request", payload: { mobile: MOBILE } });
  const { requestId, devCode } = req.json();
  const ver = await app.inject({ method: "POST", url: "/api/v1/auth/otp/verify", payload: { requestId, code: devCode, name: "Route Farmer" } });
  token = ver.json().accessToken;
  userId = ver.json().user.id;
  await db.insert(t.holdings).values({
    userId, village: "Test", district: "TestLand", areaHa: "5.00", crop: "Wheat", season: "Rabi 2026", entitlementQtl: "100.00",
  });
});

afterAll(async () => {
  await cleanup();
  await db.delete(t.holdings).where(eq(t.holdings.userId, userId));
  await db.delete(t.refreshTokens).where(eq(t.refreshTokens.userId, userId));
  await db.delete(t.messages).where(eq(t.messages.userId, userId));
  await db.delete(t.idempotencyKeys).where(eq(t.idempotencyKeys.userId, userId));
  await db.delete(t.users).where(eq(t.users.id, userId));
  await db.delete(t.centres).where(eq(t.centres.id, centreId));
  await app.close();
  await sql.end();
});

beforeEach(async () => {
  await cleanup();
  await db.delete(t.idempotencyKeys).where(eq(t.idempotencyKeys.userId, userId));
  await db.update(t.holdings).set({ usedQtl: "0" }).where(eq(t.holdings.userId, userId));
  await bootstrapSlots();
});

const auth = () => ({ authorization: `Bearer ${token}` });
const bookReq = (slotId: string, key: string, extra: object = {}) =>
  app.inject({ method: "POST", url: "/api/v1/bookings", headers: { ...auth(), "idempotency-key": key }, payload: { slotId, qtl: 10, ...extra } });

describe("slot availability", () => {
  it("shows real remaining capacity per window", async () => {
    const res = await app.inject({ method: "GET", url: `/api/v1/centres/${centreId}/slots?date=${istDate()}`, headers: auth() });
    expect(res.statusCode).toBe(200);
    const { slots } = res.json();
    expect(slots).toHaveLength(2);
    expect(slots[0]).toMatchObject({ capacityTrolleys: 5, bookedTrolleys: 0, remainingTrolleys: 5, available: true });
  });
});

describe("booking", () => {
  it("books a slot and returns a gate OTP and confirmation", async () => {
    const res = await bookReq(slotA, "key-book-1");
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.booking).toMatchObject({ centre: "Route Test Centre", qtl: 10, pool: "general", status: "booked" });
    expect(body.booking.ref).toMatch(/^KS-\d{2}-/);
    expect(body.gateOtp).toMatch(/^\d{4}$/);   // dev only
  });

  it("decrements the shown availability after a booking", async () => {
    await bookReq(slotA, "key-book-2");
    const res = await app.inject({ method: "GET", url: `/api/v1/centres/${centreId}/slots?date=${istDate()}`, headers: auth() });
    expect(res.json().slots[0]).toMatchObject({ bookedTrolleys: 1, remainingTrolleys: 4 });
  });

  it("caps a booking at the land-record entitlement", async () => {
    const res = await bookReq(slotA, "key-over", { qtl: 500 });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("ENTITLEMENT_EXCEEDED");
  });

  it("refuses a booking once the slot is full", async () => {
    // 5 seats: fill with five other farmers via the service-free path is complex;
    // instead book five trolleys in one go to exhaust, then try one more.
    await db.update(t.holdings).set({ entitlementQtl: "1000" }).where(eq(t.holdings.userId, userId));
    const full = await bookReq(slotA, "key-fill", { qtl: 50, trolleys: 5 });
    expect(full.statusCode).toBe(201);
    const over = await bookReq(slotA, "key-onemore", { qtl: 10, trolleys: 1 });
    expect(over.statusCode).toBe(409);
    expect(over.json().error.code).toBe("SLOT_FULL");
  });
});

describe("idempotency", () => {
  it("replays the same confirmation on a repeated key — the rural double-tap", async () => {
    const first = await bookReq(slotA, "double-tap");
    const second = await bookReq(slotA, "double-tap");
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json().booking.ref).toBe(first.json().booking.ref);   // same booking, not a second one

    const rows = await db.select().from(t.bookings)
      .where(and(eq(t.bookings.userId, userId), eq(t.bookings.slotId, slotA)));
    expect(rows).toHaveLength(1);
  });

  it("requires an idempotency key on a booking", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/bookings", headers: auth(), payload: { slotId: slotA, qtl: 10 } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("rejects the same key used for a different booking", async () => {
    await bookReq(slotA, "shared-key");
    const clash = await bookReq(slotB, "shared-key");
    expect(clash.statusCode).toBe(422);
    expect(clash.json().error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("replays a cached SLOT_FULL rather than trying again", async () => {
    await db.update(t.holdings).set({ entitlementQtl: "1000" }).where(eq(t.holdings.userId, userId));
    await bookReq(slotA, "fill-key", { qtl: 50, trolleys: 5 });
    const first = await bookReq(slotA, "full-tap", { qtl: 10, trolleys: 1 });
    const second = await bookReq(slotA, "full-tap", { qtl: 10, trolleys: 1 });
    expect(first.statusCode).toBe(409);
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe("SLOT_FULL");
  });
});

describe("reschedule & cancel", () => {
  it("moves a booking to a new slot", async () => {
    const booked = (await bookReq(slotA, "resched-book")).json();
    const res = await app.inject({
      method: "POST", url: `/api/v1/bookings/${booked.booking.ref}/reschedule`,
      headers: { ...auth(), "idempotency-key": "resched-move" }, payload: { slotId: slotB },
    });
    expect(res.statusCode).toBe(200);

    // Old slot freed, new slot taken.
    const slots = (await app.inject({ method: "GET", url: `/api/v1/centres/${centreId}/slots?date=${istDate()}`, headers: auth() })).json().slots;
    expect(slots[0].bookedTrolleys).toBe(0);
    expect(slots[1].bookedTrolleys).toBe(1);
  });

  it("cancels a booking and returns its capacity and entitlement", async () => {
    const booked = (await bookReq(slotA, "cancel-book")).json();
    const res = await app.inject({ method: "POST", url: `/api/v1/bookings/${booked.booking.ref}/cancel`, headers: auth() });
    expect(res.statusCode).toBe(200);

    const [holding] = await db.select().from(t.holdings).where(eq(t.holdings.userId, userId));
    expect(Number(holding!.usedQtl)).toBe(0);
    const slots = (await app.inject({ method: "GET", url: `/api/v1/centres/${centreId}/slots?date=${istDate()}`, headers: auth() })).json().slots;
    expect(slots[0].bookedTrolleys).toBe(0);
  });

  it("will not cancel someone else's booking", async () => {
    const booked = (await bookReq(slotA, "not-yours")).json();
    // Sign in a second farmer.
    const r = await app.inject({ method: "POST", url: "/api/v1/auth/otp/request", payload: { mobile: "9822200002" } });
    const { requestId, devCode } = r.json();
    const v = await app.inject({ method: "POST", url: "/api/v1/auth/otp/verify", payload: { requestId, code: devCode } });
    const otherToken = v.json().accessToken;
    const otherId = v.json().user.id;

    const res = await app.inject({
      method: "POST", url: `/api/v1/bookings/${booked.booking.ref}/cancel`,
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(res.statusCode).toBe(403);

    await db.delete(t.refreshTokens).where(eq(t.refreshTokens.userId, otherId));
    await db.delete(t.messages).where(eq(t.messages.userId, otherId));
    await db.delete(t.users).where(eq(t.users.id, otherId));
  });
});
