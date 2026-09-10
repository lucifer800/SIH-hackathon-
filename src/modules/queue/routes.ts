import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import * as t from "../../db/schema.js";
import { authenticate, requireRole } from "../../http/auth.js";
import { withIdempotency } from "../../http/idempotency.js";
import { bus } from "../../realtime/bus.js";
import { openSse } from "../../realtime/sse.js";
import {
  checkin, serveNext, farmerQueue, snapshotForToken, board, ledger, registerNotify, tokensForDay,
} from "./service.js";
import { istDate } from "../../domain/capacity.js";
import { unauthorized } from "../../http/errors.js";

const checkinBody = z.object({
  bookingRef: z.string().min(4),
  gateOtp: z.string().regex(/^\d{4}$/),
  vehicleNo: z.string().min(3).max(20),
  lane: z.number().int().positive().max(20).optional(),
  clientUuid: z.string().uuid().optional(),
});
const serveBody = z.object({ centreId: z.string().uuid(), lane: z.number().int().positive().max(20), date: z.string().optional() });
const notifyBody = z.object({ threshold: z.number().int().min(1).max(20).default(5), channel: z.enum(["sms", "ivr"]).default("sms") });

export async function queueRoutes(app: FastifyInstance) {
  /* ---- operator (centre staff only) ---- */

  app.post("/api/v1/op/checkin", { preHandler: [authenticate, requireRole("operator", "admin")] }, async (request, reply) => {
    const body = checkinBody.parse(request.body);
    const { status, body: result } = await withIdempotency(
      request,
      { userId: request.auth!.userId, route: "POST /op/checkin" },
      async () => ({
        status: 201,
        body: await checkin({
          operatorId: request.auth!.userId,
          operatorRole: request.auth!.role,
          operatorCentreId: request.auth!.role === "operator" ? await operatorCentre(request.auth!.userId) : null,
          ...body,
        }),
      }),
    );
    return reply.status(status).send(result);
  });

  app.post("/api/v1/op/serve/next", { preHandler: [authenticate, requireRole("operator", "admin")] }, async (request) => {
    const body = serveBody.parse(request.body);
    return serveNext({ operatorId: request.auth!.userId, ...body });
  });

  /* ---- farmer ---- */

  app.get("/api/v1/queue/live", { preHandler: [authenticate] }, async (request) => {
    const q = await farmerQueue(request.auth!.userId);
    return q ?? { queue: null };
  });

  app.post("/api/v1/queue/notify", { preHandler: [authenticate] }, async (request) => {
    const body = notifyBody.parse(request.body);
    return registerNotify(request.auth!.userId, body.threshold, body.channel);
  });

  /**
   * Live queue over SSE. Replaces the prototype's 4200 ms fake auto-advance:
   * the stream pushes a fresh snapshot only when the operator actually moves the
   * line. A token query param carries auth because EventSource cannot set headers.
   */
  app.get("/api/v1/queue/stream", async (request, reply) => {
    const token = (request.query as { token?: string }).token;
    if (!token) throw unauthorized("A stream token is required.");
    let userId: string;
    try {
      userId = app.jwt.verify<{ sub: string }>(token).sub;
    } catch {
      throw unauthorized("Please sign in again.");
    }

    const current = await farmerQueue(userId);
    const { send, close } = openSse(request, reply);
    if (!current) { send({ queue: null }); return reply; }

    const myTokenId = await tokenIdForUser(userId);
    send(current);
    const unsub = bus.subscribe(current.centreId, current.date, async () => {
      const snap = myTokenId ? await snapshotForToken(myTokenId) : null;
      send(snap ?? { queue: null });
    });
    request.raw.on("close", () => { unsub(); close(); });
    return reply;
  });

  /* ---- public: the mandi-gate big screen (no auth) ---- */

  app.get("/api/v1/public/board/:centreId", async (request) => {
    const { centreId } = z.object({ centreId: z.string().uuid() }).parse(request.params);
    const date = (request.query as { date?: string }).date ?? istDate();
    return { centreId, date, board: await board(centreId, date) };
  });

  app.get("/api/v1/public/board/:centreId/stream", async (request, reply) => {
    const { centreId } = z.object({ centreId: z.string().uuid() }).parse(request.params);
    const date = (request.query as { date?: string }).date ?? istDate();
    const { send, close } = openSse(request, reply);
    send(await board(centreId, date));
    const unsub = bus.subscribe(centreId, date, async () => send(await board(centreId, date)));
    request.raw.on("close", () => { unsub(); close(); });
    return reply;
  });

  /** Anonymised, auditable order for the day — names never appear. */
  app.get("/api/v1/public/board/:centreId/ledger", async (request) => {
    const { centreId } = z.object({ centreId: z.string().uuid() }).parse(request.params);
    const date = (request.query as { date?: string }).date ?? istDate();
    return ledger(centreId, date);
  });
}

async function operatorCentre(userId: string): Promise<string | null> {
  const [u] = await db.select({ centreId: t.users.centreId }).from(t.users).where(eq(t.users.id, userId)).limit(1);
  return u?.centreId ?? null;
}

async function tokenIdForUser(userId: string): Promise<string | null> {
  const q = await farmerQueue(userId);
  if (!q) return null;
  const all = await tokensForDay(q.centreId, q.date);
  // farmerQueue already resolved the seq; find the matching token id.
  const mine = all.find((x) => x.seq === q.queue.seq);
  return mine?.id ?? null;
}
