import crypto from "node:crypto";
import { and, desc, eq, gte, isNull, sql as raw } from "drizzle-orm";
import { db } from "../../db/client.js";
import * as t from "../../db/schema.js";
import type { Lang } from "../../db/schema.js";
import { channel } from "../../channels/index.js";
import { hashSecret, verifySecret, numericCode } from "../../lib/hash.js";
import { normaliseMobile, maskMobile } from "../../lib/mobile.js";
import { env } from "../../env.js";
import { unauthorized, tooManyRequests, unprocessable, notFound } from "../../http/errors.js";

/* ----------------------------------------------------------------- policy */

export const AUTH_POLICY = {
  codeDigits: 4,              // matches the four OTP boxes in the Sunrise design
  codeTtlMinutes: 5,
  maxAttempts: 5,
  requestsPerHourPerMobile: 3,
  resendAfterSeconds: 30,
  accessTtlMinutes: 15,
  refreshTtlDays: 60,         // a farmer books twice a season; do not log them out
} as const;

const minutes = (n: number) => n * 60_000;
const days = (n: number) => n * 86_400_000;

/* ------------------------------------------------------------ otp request */

export interface OtpRequestResult {
  requestId: string;
  expiresInSec: number;
  resendAfterSec: number;
  /** Non-production only, so the demo works without a real handset. */
  devCode?: string;
}

export async function requestOtp(rawMobile: string): Promise<OtpRequestResult> {
  const mobile = normaliseMobile(rawMobile);

  // 3 per hour per mobile. Counted from rows, not from Redis, so the limit holds
  // across restarts and across instances without extra infrastructure.
  const [recent] = await db
    .select({ count: raw<number>`count(*)::int` })
    .from(t.otpRequests)
    .where(
      and(
        eq(t.otpRequests.mobile, mobile),
        gte(t.otpRequests.createdAt, new Date(Date.now() - minutes(60))),
      ),
    );

  if ((recent?.count ?? 0) >= AUTH_POLICY.requestsPerHourPerMobile) {
    throw tooManyRequests(
      "Too many codes requested. Please try again in an hour, or ask for help at your panchayat.",
      { retryAfterMinutes: 60 },
    );
  }

  const code = numericCode(AUTH_POLICY.codeDigits);
  const [row] = await db
    .insert(t.otpRequests)
    .values({
      mobile,
      codeHash: hashSecret(code),
      expiresAt: new Date(Date.now() + minutes(AUTH_POLICY.codeTtlMinutes)),
    })
    .returning();

  // Existing farmers get the code in their own language; new ones get Punjabi,
  // which they can change on the screen they are already looking at.
  const existing = await findUserByMobile(mobile);
  const language: Lang = existing?.language ?? "pa";

  if (existing) {
    await channel().send({
      userId: existing.id,
      to: mobile,
      templateId: "otp_login",
      language,
      vars: { code },
    });
  } else {
    // No user row yet, so there is nothing to attach a message to. Log only —
    // the message row appears at verify time, with the welcome.
    console.log(`[sms:stub → ${maskMobile(mobile)}] KisanQ code ${code}`);
  }

  return {
    requestId: row!.id,
    expiresInSec: AUTH_POLICY.codeTtlMinutes * 60,
    resendAfterSec: AUTH_POLICY.resendAfterSeconds,
    ...(env.NODE_ENV !== "production" ? { devCode: code } : {}),
  };
}

/* ------------------------------------------------------------- otp verify */

export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
  user: PublicUser;
  isNewUser: boolean;
}

export async function verifyOtp(
  requestId: string,
  code: string,
  opts: { language?: Lang; name?: string },
  signAccess: (payload: AccessPayload) => string,
): Promise<Session> {
  const [request] = await db
    .select()
    .from(t.otpRequests)
    .where(eq(t.otpRequests.id, requestId))
    .limit(1);

  if (!request) throw unauthorized("That code request has expired. Please ask for a new code.");
  if (request.consumedAt) throw unauthorized("That code has already been used.");
  if (request.expiresAt.getTime() < Date.now()) {
    throw unauthorized("That code has expired. Please ask for a new one.");
  }

  if (request.attempts >= AUTH_POLICY.maxAttempts) {
    throw tooManyRequests("Too many wrong attempts. Please ask for a new code.");
  }

  if (!verifySecret(String(code ?? ""), request.codeHash)) {
    const attempts = request.attempts + 1;
    // Burn the request on the last attempt so a brute force cannot continue.
    await db
      .update(t.otpRequests)
      .set({ attempts, consumedAt: attempts >= AUTH_POLICY.maxAttempts ? new Date() : null })
      .where(eq(t.otpRequests.id, requestId));

    const left = AUTH_POLICY.maxAttempts - attempts;
    throw unauthorized(
      left > 0
        ? `That code is not right. ${left} ${left === 1 ? "try" : "tries"} left.`
        : "Too many wrong attempts. Please ask for a new code.",
    );
  }

  await db
    .update(t.otpRequests)
    .set({ consumedAt: new Date() })
    .where(eq(t.otpRequests.id, requestId));

  let user = await findUserByMobile(request.mobile);
  let isNewUser = false;

  if (!user) {
    isNewUser = true;
    const [created] = await db
      .insert(t.users)
      .values({
        mobile: request.mobile,
        name: opts.name?.trim() || "Farmer",
        language: opts.language ?? "pa",
        role: "farmer",
      })
      .returning();
    user = created!;

    await channel().send({
      userId: user.id,
      to: user.mobile,
      templateId: "welcome",
      language: user.language,
      vars: { name: user.name },
      channel: "in_app",
    });
  } else if (opts.language && opts.language !== user.language) {
    // The language chosen on the sign-in screen is a real preference, and every
    // later SMS and IVR call depends on it being stored.
    const [updated] = await db
      .update(t.users)
      .set({ language: opts.language })
      .where(eq(t.users.id, user.id))
      .returning();
    user = updated!;
  }

  const tokens = await issueSession(user, signAccess);
  return { ...tokens, user: publicUser(user), isNewUser };
}

/* ------------------------------------------------------------- sessions */

export interface AccessPayload {
  sub: string;
  role: string;
  lang: Lang;
}

async function issueSession(
  user: typeof t.users.$inferSelect,
  signAccess: (payload: AccessPayload) => string,
  familyId: string = crypto.randomUUID(),
) {
  const refreshToken = crypto.randomBytes(32).toString("hex");
  await db.insert(t.refreshTokens).values({
    userId: user.id,
    tokenHash: hashSecret(refreshToken),
    familyId,
    expiresAt: new Date(Date.now() + days(AUTH_POLICY.refreshTtlDays)),
  });

  return {
    accessToken: signAccess({ sub: user.id, role: user.role, lang: user.language }),
    refreshToken: `${familyId}.${refreshToken}`,
    expiresInSec: AUTH_POLICY.accessTtlMinutes * 60,
  };
}

/**
 * Rotating refresh with family revocation.
 *
 * Presenting a token that was already rotated means one of two things: a replay,
 * or a stolen token being used alongside the real one. Both are answered the same
 * way — kill every token in the family and make the farmer sign in again. It is
 * the one place where inconveniencing a real user is the correct trade.
 */
export async function rotateRefresh(
  presented: string,
  signAccess: (payload: AccessPayload) => string,
) {
  const [familyId, secret] = String(presented ?? "").split(".");
  if (!familyId || !secret) throw unauthorized("Please sign in again.");

  const family = await db
    .select()
    .from(t.refreshTokens)
    .where(eq(t.refreshTokens.familyId, familyId))
    .orderBy(desc(t.refreshTokens.createdAt));

  if (!family.length) throw unauthorized("Please sign in again.");

  const match = family.find((row) => verifySecret(secret, row.tokenHash));
  if (!match) throw unauthorized("Please sign in again.");

  if (match.revokedAt) {
    await revokeFamily(familyId);
    throw unauthorized("Your session was used from somewhere else. Please sign in again.");
  }
  if (match.expiresAt.getTime() < Date.now()) throw unauthorized("Please sign in again.");

  await db
    .update(t.refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(t.refreshTokens.id, match.id));

  const [user] = await db.select().from(t.users).where(eq(t.users.id, match.userId)).limit(1);
  if (!user) throw unauthorized("Please sign in again.");

  const tokens = await issueSession(user, signAccess, familyId);
  return { ...tokens, user: publicUser(user) };
}

export async function revokeFamily(familyId: string) {
  await db
    .update(t.refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(t.refreshTokens.familyId, familyId), isNull(t.refreshTokens.revokedAt)));
}

export async function logout(presented: string) {
  const [familyId] = String(presented ?? "").split(".");
  if (familyId) await revokeFamily(familyId);
}

/* ------------------------------------------------------------------ user */

export type PublicUser = ReturnType<typeof publicUser>;

export function publicUser(user: typeof t.users.$inferSelect) {
  return {
    id: user.id,
    mobile: user.mobile,
    name: user.name,
    language: user.language,
    role: user.role,
    district: user.district ?? "",
    priorityScore: user.priorityScore,
    noShowCount: user.noShowCount,
  };
}

async function findUserByMobile(mobile: string) {
  const [row] = await db.select().from(t.users).where(eq(t.users.mobile, mobile)).limit(1);
  return row ?? null;
}

export async function meWithHolding(userId: string) {
  const [user] = await db.select().from(t.users).where(eq(t.users.id, userId)).limit(1);
  if (!user) throw notFound("Account");

  const [holding] = await db
    .select()
    .from(t.holdings)
    .where(eq(t.holdings.userId, userId))
    .limit(1);

  return {
    user: publicUser(user),
    holding: holding
      ? {
          village: holding.village,
          district: holding.district,
          areaHa: Number(holding.areaHa),
          crop: holding.crop,
          entitlementQtl: Number(holding.entitlementQtl),
          usedQtl: Number(holding.usedQtl),
        }
      : null,
  };
}

export async function updateMe(userId: string, patch: { name?: string; language?: Lang }) {
  const name = patch.name?.trim();
  if (name !== undefined && name.length < 2) {
    throw unprocessable("NAME_TOO_SHORT", "Enter your full name.");
  }

  const [updated] = await db
    .update(t.users)
    .set({ ...(name ? { name } : {}), ...(patch.language ? { language: patch.language } : {}) })
    .where(eq(t.users.id, userId))
    .returning();

  if (!updated) throw notFound("Account");
  return publicUser(updated);
}
