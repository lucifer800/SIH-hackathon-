/**
 * Messages route tests: verifies the GET /api/v1/messages response shape (including
 * the language field added in the alerts fix) and the regression guard that a booking
 * always creates a corresponding messages row so the Alerts screen is never empty.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { db } from "../src/db/client.js";
import * as t from "../src/db/schema.js";
import { normaliseMobile } from "../src/lib/mobile.js";
import { hashSecret } from "../src/lib/hash.js";

let app: FastifyInstance;
let token = "";
let userId = "";

const MOBILE = "9822299001";
const TEST_CODE = "1234";
const CODE = "msg-test-centre";

async function login() {
  const mobile = normaliseMobile(MOBILE);
  // Insert OTP with a known plaintext code so tests don't depend on devCode in response.
  const [row] = await db.insert(t.otpRequests).values({
    mobile,
    codeHash: hashSecret(TEST_CODE),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  }).returning();
  const verifyRes = await app.inject({ method: "POST", url: "/api/v1/auth/otp/verify", payload: { requestId: row!.id, code: TEST_CODE, name: "Msg Test Farmer" } });
  if (verifyRes.statusCode >= 400) throw new Error(`OTP verify failed ${verifyRes.statusCode}: ${verifyRes.body}`);
  const j = verifyRes.json();
  token = j.accessToken;
  userId = j.user.id;
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  const m = normaliseMobile(MOBILE);
  await db.delete(t.otpRequests).where(eq(t.otpRequests.mobile, m));
  const [u] = await db.select().from(t.users).where(eq(t.users.mobile, m)).limit(1);
  if (u) await db.delete(t.messages).where(eq(t.messages.userId, u.id));

  await login();
});

afterAll(async () => {
  if (userId) await db.delete(t.messages).where(eq(t.messages.userId, userId));
  await app.close();
});

describe("GET /api/v1/messages", () => {
  it("returns messages array and unread count", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/messages", headers: { Authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("messages");
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body).toHaveProperty("unread");
  });

  it("includes language field on each message row", async () => {
    await db.insert(t.messages).values({
      userId,
      channel: "sms",
      templateId: "test_template",
      language: "pa",
      category: "booking",
      body: "ਟੈਸਟ ਸੁਨੇਹਾ",
      status: "sent",
      sentAt: new Date(),
    });

    const res = await app.inject({ method: "GET", url: "/api/v1/messages", headers: { Authorization: `Bearer ${token}` } });
    const { messages } = res.json();
    const inserted = messages.find((m: any) => m.body === "ਟੈਸਟ ਸੁਨੇਹਾ");
    expect(inserted).toBeDefined();
    expect(inserted.language).toBe("pa");
  });

  it("returns 401 without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/messages" });
    expect(res.statusCode).toBe(401);
  });
});

describe("Booking creates a messages row (alert regression)", () => {
  let centreId = "";

  beforeAll(async () => {
    // Clean up any leftover centre from a prior interrupted run.
    const [existing] = await db.select({ id: t.centres.id }).from(t.centres).where(eq(t.centres.code, CODE)).limit(1);
    if (existing) {
      const days = await db.select({ id: t.centreDays.id }).from(t.centreDays).where(eq(t.centreDays.centreId, existing.id));
      for (const d of days) {
        const ss = await db.select({ id: t.slots.id }).from(t.slots).where(eq(t.slots.centreDayId, d.id));
        for (const s of ss) await db.delete(t.bookings).where(eq(t.bookings.slotId, s.id));
        await db.delete(t.slots).where(eq(t.slots.centreDayId, d.id));
      }
      await db.delete(t.centreDays).where(eq(t.centreDays.centreId, existing.id));
      await db.delete(t.centres).where(eq(t.centres.code, CODE));
    }

    // Ensure the user has a holding so the booking entitlement check passes.
    const exists = await db.select().from(t.holdings).where(eq(t.holdings.userId, userId)).limit(1);
    if (exists.length === 0) {
      await db.insert(t.holdings).values({
        userId,
        village: "Test Village",
        district: "Ahmedabad",
        areaHa: "5",
        crop: "Wheat",
        season: "RMS-2026",
        entitlementQtl: "1000",
        usedQtl: "0",
      });
    }

    const [c] = await db.insert(t.centres).values({
      name: "Messages Test Centre",
      code: CODE,
      district: "Ahmedabad",
      lat: "23.0", lng: "72.5",
      weighbridgeQtlDay: 9999, gunnyBags: 99999, godownFreeQtl: 9999,
    }).returning();
    centreId = c!.id;

    const today = new Date().toISOString().slice(0, 10);
    const [day] = await db.insert(t.centreDays).values({
      centreId,
      date: today,
      capacityQtl: 250,
      capacityTrolleys: 10,
      poolsReleasedAt: new Date(),
    }).returning();

    await db.insert(t.slots).values({
      centreDayId: day!.id,
      windowStart: new Date(`${today}T08:00:00+05:30`),
      windowEnd: new Date(`${today}T10:00:00+05:30`),
      capacityTrolleys: 5,
      capacityQtl: 125,
    });
  });

  afterAll(async () => {
    // Delete child rows before the centre to satisfy FK constraints.
    const days = await db.select({ id: t.centreDays.id }).from(t.centreDays)
      .where(eq(t.centreDays.centreId, centreId));
    for (const d of days) {
      const slots2 = await db.select({ id: t.slots.id }).from(t.slots).where(eq(t.slots.centreDayId, d.id));
      for (const s of slots2) await db.delete(t.bookings).where(eq(t.bookings.slotId, s.id));
      await db.delete(t.slots).where(eq(t.slots.centreDayId, d.id));
    }
    await db.delete(t.centreDays).where(eq(t.centreDays.centreId, centreId));
    await db.delete(t.centres).where(eq(t.centres.code, CODE));
  });

  it("inserts a messages row after a successful booking", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const slotsRes = await app.inject({
      method: "GET",
      url: `/api/v1/centres/${centreId}/slots?date=${today}`,
      headers: { Authorization: `Bearer ${token}` },
    });
    const slots = slotsRes.json().slots ?? [];
    if (slots.length === 0) throw new Error("No slots available for test centre — check centre setup");
    expect(slots.some((s: any) => !s.full)).toBe(true);

    const slotId = slots[0].id;
    const before = await db.select().from(t.messages).where(eq(t.messages.userId, userId));

    await app.inject({
      method: "POST",
      url: "/api/v1/bookings",
      headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": crypto.randomUUID() },
      payload: { slotId, qtl: 50, crop: "Wheat" },
    });

    const after = await db.select().from(t.messages).where(eq(t.messages.userId, userId));
    expect(after.length).toBeGreaterThan(before.length);

    const alertRow = after.find((m) => m.templateId === "booking_confirmed");
    expect(alertRow).toBeDefined();
    expect(alertRow!.channel).toBe("sms");
    expect(alertRow!.language).toBeTruthy();
  });
});
