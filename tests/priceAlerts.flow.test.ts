/**
 * The price-alert gate: a farmer sets a target, the daily job fires exactly
 * one SMS the day the rate meets it, and deactivates the alert so a second
 * run never fires again — no daily spam.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { db } from "../src/db/client.js";
import * as t from "../src/db/schema.js";
import { normaliseMobile } from "../src/lib/mobile.js";
import { hashSecret } from "../src/lib/hash.js";
import { checkPriceAlerts } from "../src/modules/rates/alerts.js";
import { istDate } from "../src/domain/capacity.js";

let app: FastifyInstance;
let token = "";
let userId = "";

const MOBILE = "9822299020";
const TEST_CODE = "1234";
const MANDI = "Alert Test Mandi";

async function login() {
  const mobile = normaliseMobile(MOBILE);
  const [row] = await db.insert(t.otpRequests).values({
    mobile,
    codeHash: hashSecret(TEST_CODE),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  }).returning();
  const res = await app.inject({ method: "POST", url: "/api/v1/auth/otp/verify", payload: { requestId: row!.id, code: TEST_CODE, name: "Alert Test Farmer" } });
  if (res.statusCode >= 400) throw new Error(`OTP verify failed ${res.statusCode}: ${res.body}`);
  const j = res.json();
  token = j.accessToken;
  userId = j.user.id;
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  const mobile = normaliseMobile(MOBILE);
  await db.delete(t.otpRequests).where(eq(t.otpRequests.mobile, mobile));
  const [existing] = await db.select().from(t.users).where(eq(t.users.mobile, mobile)).limit(1);
  if (existing) {
    await db.delete(t.messages).where(eq(t.messages.userId, existing.id));
    await db.delete(t.priceAlerts).where(eq(t.priceAlerts.userId, existing.id));
  }
  await db.delete(t.rates).where(eq(t.rates.mandi, MANDI));

  await login();
});

afterAll(async () => {
  await db.delete(t.messages).where(eq(t.messages.userId, userId));
  await db.delete(t.priceAlerts).where(eq(t.priceAlerts.userId, userId));
  await db.delete(t.rates).where(eq(t.rates.mandi, MANDI));
  await app.close();
});

describe("price alerts — set, fire once, deactivate", () => {
  it("sets an alert via the API", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/v1/rates/alert",
      headers: { Authorization: `Bearer ${token}` },
      payload: { crop: "Wheat", targetPrice: 2000 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ crop: "Wheat" });

    const listRes = await app.inject({ method: "GET", url: "/api/v1/rates/alerts", headers: { Authorization: `Bearer ${token}` } });
    expect(listRes.json().alerts).toHaveLength(1);
  });

  it("fires exactly once when today's rate meets the target, then deactivates", async () => {
    await db.insert(t.rates).values({
      crop: "Wheat", mandi: MANDI, district: "Test District", date: istDate(),
      msp: "2000", modalPrice: "2100", source: "seed",
    });

    const before = await db.select().from(t.messages).where(eq(t.messages.userId, userId));
    const first = await checkPriceAlerts();
    expect(first.fired).toBeGreaterThanOrEqual(1);

    const after = await db.select().from(t.messages).where(eq(t.messages.userId, userId));
    const fired = after.find((m) => m.templateId === "price_alert" && !before.some((b) => b.id === m.id));
    expect(fired).toBeDefined();
    expect(fired!.channel).toBe("sms");

    const [alertRow] = await db.select().from(t.priceAlerts).where(and(eq(t.priceAlerts.userId, userId), eq(t.priceAlerts.crop, "Wheat")));
    expect(alertRow!.active).toBe(false);

    // The gate: a second run must not fire again for this (now-inactive) alert.
    const messagesBeforeSecondRun = await db.select().from(t.messages).where(eq(t.messages.userId, userId));
    await checkPriceAlerts();
    const messagesAfterSecondRun = await db.select().from(t.messages).where(eq(t.messages.userId, userId));
    expect(messagesAfterSecondRun.length).toBe(messagesBeforeSecondRun.length);
  });

  it("deleting an alert deactivates it", async () => {
    const setRes = await app.inject({
      method: "POST", url: "/api/v1/rates/alert",
      headers: { Authorization: `Bearer ${token}` },
      payload: { crop: "Paddy", targetPrice: 1800 },
    });
    const { id } = setRes.json();

    const delRes = await app.inject({ method: "DELETE", url: `/api/v1/rates/alert/${id}`, headers: { Authorization: `Bearer ${token}` } });
    expect(delRes.statusCode).toBe(204);

    const listRes = await app.inject({ method: "GET", url: "/api/v1/rates/alerts", headers: { Authorization: `Bearer ${token}` } });
    expect(listRes.json().alerts.find((a: any) => a.id === id)).toBeUndefined();
  });
});
