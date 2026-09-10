import crypto from "node:crypto";
import type { FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import * as t from "../db/schema.js";
import { badRequest, conflict, unprocessable, AppError } from "./errors.js";

/**
 * Idempotency for mutations.
 *
 * On a rural connection the farmer WILL double-tap "Book it", and the offline
 * operator console WILL replay its outbox after a reconnect. Both must land at
 * most once. The client sends an `Idempotency-Key`; we reserve it, run the work,
 * store the response, and replay it verbatim on any repeat within 24 hours.
 *
 * The reserve-first pattern also settles the true-simultaneous case: two requests
 * with the same key race to INSERT, exactly one wins the primary key, and the
 * loser is told the first is in progress rather than being run a second time.
 */

export interface IdempotencyContext {
  userId: string | null;
  route: string;
}

export function hashRequest(route: string, body: unknown): string {
  return crypto.createHash("sha256").update(`${route}\n${JSON.stringify(body ?? {})}`).digest("hex");
}

export function idempotencyKey(request: FastifyRequest): string {
  const key = request.headers["idempotency-key"];
  const value = Array.isArray(key) ? key[0] : key;
  if (!value || value.length < 8 || value.length > 200) {
    throw badRequest(
      "IDEMPOTENCY_KEY_REQUIRED",
      "This action needs an Idempotency-Key header (8–200 chars).",
    );
  }
  return value;
}

/**
 * Wraps a mutating handler. `compute` runs at most once per key; its result is
 * cached and replayed. `compute` returns the status code and body to send.
 */
export async function withIdempotency<T>(
  request: FastifyRequest,
  ctx: IdempotencyContext,
  compute: () => Promise<{ status: number; body: T }>,
): Promise<{ status: number; body: T; replayed: boolean }> {
  const key = idempotencyKey(request);
  const requestHash = hashRequest(ctx.route, request.body);
  return runIdempotent(key, ctx, requestHash, compute);
}

/**
 * Key-level idempotency, independent of HTTP. The offline operator sync reuses
 * this so every replayed operation is deduped by its client UUID exactly like a
 * double-tapped request.
 */
export async function runIdempotent<T>(
  key: string,
  ctx: IdempotencyContext,
  requestHash: string,
  compute: () => Promise<{ status: number; body: T }>,
): Promise<{ status: number; body: T; replayed: boolean }> {

  // Reserve the key. ON CONFLICT DO NOTHING means the winner gets a row back and
  // everyone else gets nothing — no exception to catch, no race to lose.
  const reserved = await db
    .insert(t.idempotencyKeys)
    .values({ key, userId: ctx.userId, route: ctx.route, requestHash })
    .onConflictDoNothing()
    .returning({ key: t.idempotencyKeys.key });

  if (reserved.length === 0) {
    const [existing] = await db
      .select()
      .from(t.idempotencyKeys)
      .where(eq(t.idempotencyKeys.key, key))
      .limit(1);

    if (!existing) throw conflict("IDEMPOTENCY_IN_PROGRESS", "Please try again in a moment.");

    // Same key, different body is a client bug — never silently serve the old answer.
    if (existing.requestHash !== requestHash) {
      throw unprocessable(
        "IDEMPOTENCY_KEY_REUSED",
        "This Idempotency-Key was already used for a different request.",
      );
    }

    if (existing.statusCode == null || existing.response == null) {
      throw conflict("IDEMPOTENCY_IN_PROGRESS", "That request is still being processed.");
    }

    return { status: existing.statusCode, body: existing.response as T, replayed: true };
  }

  // We own the key. Run the work; store the outcome so a repeat replays it.
  try {
    const result = await compute();
    await db
      .update(t.idempotencyKeys)
      .set({ statusCode: result.status, response: result.body as object })
      .where(eq(t.idempotencyKeys.key, key));
    return { ...result, replayed: false };
  } catch (error) {
    // A failed attempt must not poison the key — release it so a retry can succeed.
    // (A deliberate, deterministic refusal like SLOT_FULL is cached below instead.)
    if (error instanceof AppError && error.statusCode >= 400 && error.statusCode < 500 && error.cacheable) {
      await db
        .update(t.idempotencyKeys)
        .set({ statusCode: error.statusCode, response: { error: { code: error.code, message: error.message, details: error.details } } })
        .where(eq(t.idempotencyKeys.key, key));
    } else {
      await db.delete(t.idempotencyKeys).where(eq(t.idempotencyKeys.key, key));
    }
    throw error;
  }
}
