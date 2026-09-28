/**
 * The produce listing board gate: post → visible on the public board filtered
 * by crop/district, an expired listing never shows, and only the posting
 * farmer can mark it sold or delete it.
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
let tokenA = "", userIdA = "";
let tokenB = "", userIdB = "";

const MOBILE_A = "9822299030";
const MOBILE_B = "9822299031";
const TEST_CODE = "1234";
const DISTRICT = "Listings Test District";

async function login(mobile: string, name: string): Promise<{ token: string; userId: string }> {
  const m = normaliseMobile(mobile);
  const [row] = await db.insert(t.otpRequests).values({
    mobile: m,
    codeHash: hashSecret(TEST_CODE),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  }).returning();
  const res = await app.inject({ method: "POST", url: "/api/v1/auth/otp/verify", payload: { requestId: row!.id, code: TEST_CODE, name } });
  if (res.statusCode >= 400) throw new Error(`OTP verify failed ${res.statusCode}: ${res.body}`);
  const j = res.json();
  return { token: j.accessToken, userId: j.user.id };
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  for (const mobile of [MOBILE_A, MOBILE_B]) {
    const m = normaliseMobile(mobile);
    await db.delete(t.otpRequests).where(eq(t.otpRequests.mobile, m));
    const [existing] = await db.select().from(t.users).where(eq(t.users.mobile, m)).limit(1);
    if (existing) await db.delete(t.listings).where(eq(t.listings.userId, existing.id));
  }

  const a = await login(MOBILE_A, "Listing Farmer A");
  tokenA = a.token; userIdA = a.userId;
  const b = await login(MOBILE_B, "Listing Farmer B");
  tokenB = b.token; userIdB = b.userId;
});

afterAll(async () => {
  await db.delete(t.listings).where(eq(t.listings.userId, userIdA));
  await db.delete(t.listings).where(eq(t.listings.userId, userIdB));
  await app.close();
});

describe("produce listing board", () => {
  it("posts a listing and finds it on the public board, filtered by crop + district", async () => {
    const postRes = await app.inject({
      method: "POST", url: "/api/v1/listings",
      headers: { Authorization: `Bearer ${tokenA}` },
      payload: { crop: "Wheat", qtl: 20, askingPrice: 2200, village: "Test Village", district: DISTRICT },
    });
    expect(postRes.statusCode).toBe(201);
    const { id } = postRes.json();

    const boardRes = await app.inject({ method: "GET", url: `/api/v1/listings?crop=Wheat&district=${encodeURIComponent(DISTRICT)}` });
    expect(boardRes.statusCode).toBe(200);
    const found = boardRes.json().listings.find((l: any) => l.id === id);
    expect(found).toBeDefined();
    expect(found.farmerMobile).toBeTruthy();

    const wrongCropRes = await app.inject({ method: "GET", url: `/api/v1/listings?crop=Paddy&district=${encodeURIComponent(DISTRICT)}` });
    expect(wrongCropRes.json().listings.find((l: any) => l.id === id)).toBeUndefined();
  });

  it("never shows an expired listing on the board", async () => {
    const [expired] = await db.insert(t.listings).values({
      userId: userIdA, crop: "Maize", qtl: "10", askingPrice: "1900",
      village: "Test Village", district: DISTRICT, status: "active",
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // yesterday
    }).returning();

    const boardRes = await app.inject({ method: "GET", url: `/api/v1/listings?crop=Maize&district=${encodeURIComponent(DISTRICT)}` });
    expect(boardRes.json().listings.find((l: any) => l.id === expired!.id)).toBeUndefined();
  });

  it("only the posting farmer can mark their listing sold or delete it", async () => {
    const postRes = await app.inject({
      method: "POST", url: "/api/v1/listings",
      headers: { Authorization: `Bearer ${tokenA}` },
      payload: { crop: "Paddy", qtl: 15, askingPrice: 2000, village: "Test Village", district: DISTRICT },
    });
    const { id } = postRes.json();

    // Farmer B (not the owner) cannot mark it sold — the row must stay untouched.
    await app.inject({ method: "PATCH", url: `/api/v1/listings/${id}/sold`, headers: { Authorization: `Bearer ${tokenB}` } });
    const [afterOtherFarmer] = await db.select().from(t.listings).where(eq(t.listings.id, id));
    expect(afterOtherFarmer!.status).toBe("active");

    // The owner can.
    const soldRes = await app.inject({ method: "PATCH", url: `/api/v1/listings/${id}/sold`, headers: { Authorization: `Bearer ${tokenA}` } });
    expect(soldRes.statusCode).toBe(204);
    const [afterOwner] = await db.select().from(t.listings).where(eq(t.listings.id, id));
    expect(afterOwner!.status).toBe("sold");
  });

  it("only the posting farmer can delete their listing", async () => {
    const postRes = await app.inject({
      method: "POST", url: "/api/v1/listings",
      headers: { Authorization: `Bearer ${tokenA}` },
      payload: { crop: "Wheat", qtl: 12, askingPrice: 2100, village: "Test Village", district: DISTRICT },
    });
    const { id } = postRes.json();

    await app.inject({ method: "DELETE", url: `/api/v1/listings/${id}`, headers: { Authorization: `Bearer ${tokenB}` } });
    const [afterOtherFarmer] = await db.select().from(t.listings).where(eq(t.listings.id, id));
    expect(afterOtherFarmer).toBeDefined(); // still there — farmer B's delete was a no-op

    const delRes = await app.inject({ method: "DELETE", url: `/api/v1/listings/${id}`, headers: { Authorization: `Bearer ${tokenA}` } });
    expect(delRes.statusCode).toBe(204);
    const [afterOwner] = await db.select().from(t.listings).where(eq(t.listings.id, id));
    expect(afterOwner).toBeUndefined();
  });
});
