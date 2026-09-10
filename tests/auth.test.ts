/**
 * Route-level auth tests against a real Postgres.
 *
 * These hit the database on purpose. Attempt counters, session families and the
 * per-mobile rate limit are all row-level behaviour — a mock would only prove
 * that the mock works.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, inArray } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { db, sql } from "../src/db/client.js";
import * as t from "../src/db/schema.js";
import { normaliseMobile } from "../src/lib/mobile.js";

let app: FastifyInstance;

const NEW_FARMER = "9812345670";
const SECOND = "9812345671";
const ALL = [NEW_FARMER, SECOND].map(normaliseMobile);

async function wipe() {
  const users = await db.select({ id: t.users.id }).from(t.users)
    .where(inArray(t.users.mobile, ALL));
  const ids = users.map((u) => u.id);
  if (ids.length) {
    await db.delete(t.refreshTokens).where(inArray(t.refreshTokens.userId, ids));
    await db.delete(t.messages).where(inArray(t.messages.userId, ids));
    await db.delete(t.users).where(inArray(t.users.id, ids));
  }
  await db.delete(t.otpRequests).where(inArray(t.otpRequests.mobile, ALL));
}

const post = (url: string, payload: object) =>
  app.inject({ method: "POST", url, payload: payload as never });

async function signIn(mobile: string, extra: Record<string, unknown> = {}) {
  const req = await post("/api/v1/auth/otp/request", { mobile });
  const { requestId, devCode } = req.json();
  const res = await post("/api/v1/auth/otp/verify", { requestId, code: devCode, ...extra });
  return { res, body: res.json() };
}

beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await wipe(); await app.close(); await sql.end(); });
beforeEach(wipe);

describe("otp request", () => {
  it("accepts a 10-digit number and returns a request id", async () => {
    const res = await post("/api/v1/auth/otp/request", { mobile: NEW_FARMER });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.requestId).toBeTruthy();
    expect(body.expiresInSec).toBe(300);
    expect(body.devCode).toMatch(/^\d{4}$/);   // dev only — absent in production
  });

  it("treats +91 and bare 10 digits as the same farmer", async () => {
    await post("/api/v1/auth/otp/request", { mobile: NEW_FARMER });
    await post("/api/v1/auth/otp/request", { mobile: `+91${NEW_FARMER}` });
    const rows = await db.select().from(t.otpRequests)
      .where(eq(t.otpRequests.mobile, normaliseMobile(NEW_FARMER)));
    expect(rows).toHaveLength(2);
  });

  it("refuses a number that is not an Indian mobile", async () => {
    const res = await post("/api/v1/auth/otp/request", { mobile: "1234567890" });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("MOBILE_INVALID");
  });

  it("stops at three codes an hour for one mobile", async () => {
    for (let i = 0; i < 3; i++) {
      expect((await post("/api/v1/auth/otp/request", { mobile: NEW_FARMER })).statusCode).toBe(200);
    }
    const fourth = await post("/api/v1/auth/otp/request", { mobile: NEW_FARMER });
    expect(fourth.statusCode).toBe(429);
    expect(fourth.json().error.code).toBe("RATE_LIMITED");
  });
});

describe("otp verify", () => {
  it("creates the farmer on first sign-in and returns 201", async () => {
    const { res, body } = await signIn(NEW_FARMER, { language: "pa", name: "Balwinder Singh" });
    expect(res.statusCode).toBe(201);
    expect(body.isNewUser).toBe(true);
    expect(body.user).toMatchObject({
      mobile: normaliseMobile(NEW_FARMER), name: "Balwinder Singh",
      language: "pa", role: "farmer", priorityScore: 100, noShowCount: 0,
    });
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toContain(".");
  });

  it("returns 200 and the same user on the second sign-in", async () => {
    await signIn(NEW_FARMER, { name: "Balwinder Singh" });
    const { res, body } = await signIn(NEW_FARMER);
    expect(res.statusCode).toBe(200);
    expect(body.isNewUser).toBe(false);
    expect(body.user.name).toBe("Balwinder Singh");
  });

  it("stores the language chosen on the sign-in screen", async () => {
    await signIn(NEW_FARMER);
    const { body } = await signIn(NEW_FARMER, { language: "hi" });
    expect(body.user.language).toBe("hi");
  });

  it("writes a welcome message a new farmer can find in their alerts", async () => {
    const { body } = await signIn(NEW_FARMER, { language: "pa", name: "Balwinder Singh" });
    const msgs = await db.select().from(t.messages).where(eq(t.messages.userId, body.user.id));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.templateId).toBe("welcome");
    expect(msgs[0]!.body).toContain("Balwinder Singh");
  });

  it("counts down wrong attempts, then burns the request at five", async () => {
    const { requestId } = (await post("/api/v1/auth/otp/request", { mobile: NEW_FARMER })).json();

    for (let i = 1; i <= 4; i++) {
      const res = await post("/api/v1/auth/otp/verify", { requestId, code: "0000" });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.message).toContain(`${5 - i} `);
    }
    const fifth = await post("/api/v1/auth/otp/verify", { requestId, code: "0000" });
    expect(fifth.statusCode).toBe(401);

    // The request is now burned — even the right code will not work.
    const [row] = await db.select().from(t.otpRequests).where(eq(t.otpRequests.id, requestId));
    expect(row!.consumedAt).not.toBeNull();
  });

  it("refuses a code that was already used", async () => {
    const req = await post("/api/v1/auth/otp/request", { mobile: NEW_FARMER });
    const { requestId, devCode } = req.json();
    expect((await post("/api/v1/auth/otp/verify", { requestId, code: devCode })).statusCode).toBe(201);
    const replay = await post("/api/v1/auth/otp/verify", { requestId, code: devCode });
    expect(replay.statusCode).toBe(401);
    expect(replay.json().error.message).toContain("already been used");
  });

  it("refuses an expired code", async () => {
    const { requestId, devCode } = (await post("/api/v1/auth/otp/request", { mobile: NEW_FARMER })).json();
    await db.update(t.otpRequests).set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(t.otpRequests.id, requestId));
    const res = await post("/api/v1/auth/otp/verify", { requestId, code: devCode });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.message).toContain("expired");
  });

  it("rejects a code that is not four digits before it reaches the database", async () => {
    const { requestId } = (await post("/api/v1/auth/otp/request", { mobile: NEW_FARMER })).json();
    const res = await post("/api/v1/auth/otp/verify", { requestId, code: "12" });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("VALIDATION_FAILED");
  });
});

describe("refresh rotation", () => {
  it("rotates and keeps the farmer signed in", async () => {
    const { body } = await signIn(NEW_FARMER);
    const res = await post("/api/v1/auth/refresh", { refreshToken: body.refreshToken });
    expect(res.statusCode).toBe(200);
    const rotated = res.json();
    expect(rotated.refreshToken).not.toBe(body.refreshToken);
    expect(rotated.user.id).toBe(body.user.id);
  });

  it("revokes the whole family when an already-rotated token comes back", async () => {
    const { body } = await signIn(NEW_FARMER);
    const first = (await post("/api/v1/auth/refresh", { refreshToken: body.refreshToken })).json();

    // Replay of the original — a stolen token, or a stale client.
    const replay = await post("/api/v1/auth/refresh", { refreshToken: body.refreshToken });
    expect(replay.statusCode).toBe(401);
    expect(replay.json().error.message).toContain("somewhere else");

    // The legitimately rotated token is dead too — that is the point.
    const after = await post("/api/v1/auth/refresh", { refreshToken: first.refreshToken });
    expect(after.statusCode).toBe(401);

    const rows = await db.select().from(t.refreshTokens)
      .where(eq(t.refreshTokens.userId, body.user.id));
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
  });

  it("refuses a made-up token", async () => {
    const res = await post("/api/v1/auth/refresh", {
      refreshToken: "00000000-0000-0000-0000-000000000000.deadbeef",
    });
    expect(res.statusCode).toBe(401);
  });

  it("signs out by revoking the family", async () => {
    const { body } = await signIn(NEW_FARMER);
    expect((await post("/api/v1/auth/logout", { refreshToken: body.refreshToken })).statusCode).toBe(200);
    expect((await post("/api/v1/auth/refresh", { refreshToken: body.refreshToken })).statusCode).toBe(401);
  });
});

describe("/me", () => {
  it("needs a token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/me" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
  });

  it("returns the user and their holding", async () => {
    const { body } = await signIn(NEW_FARMER, { name: "Balwinder Singh" });
    await db.insert(t.holdings).values({
      userId: body.user.id, village: "Kaunke Kalan", district: "Ludhiana",
      areaHa: "1.60", crop: "Wheat", season: "Rabi 2026", entitlementQtl: "64.00",
    });

    const res = await app.inject({
      method: "GET", url: "/api/v1/me",
      headers: { authorization: `Bearer ${body.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().holding).toMatchObject({ areaHa: 1.6, entitlementQtl: 64, usedQtl: 0 });
  });

  it("rejects a token signed by someone else", async () => {
    const res = await app.inject({
      method: "GET", url: "/api/v1/me",
      headers: { authorization: "Bearer not.a.jwt" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("updates name and language", async () => {
    const { body } = await signIn(NEW_FARMER);
    const res = await app.inject({
      method: "PATCH", url: "/api/v1/me",
      headers: { authorization: `Bearer ${body.accessToken}` },
      payload: { name: "Balwinder Singh", language: "hi" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({ name: "Balwinder Singh", language: "hi" });
  });
});

describe("session isolation", () => {
  it("does not let one farmer's token read another's account", async () => {
    const a = (await signIn(NEW_FARMER, { name: "Farmer A" })).body;
    const b = (await signIn(SECOND, { name: "Farmer B" })).body;
    const res = await app.inject({
      method: "GET", url: "/api/v1/me",
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    expect(res.json().user.id).toBe(a.user.id);
    expect(res.json().user.id).not.toBe(b.user.id);
  });
});
