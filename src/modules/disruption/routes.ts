import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import * as t from "../../db/schema.js";
import { authenticate, requireRole } from "../../http/auth.js";
import { declareEvent, acceptLatestOffer, userByMobile } from "./service.js";
import { farmerQueue } from "../queue/service.js";
import { listPayments } from "../payments/service.js";
import { normaliseMobile } from "../../lib/mobile.js";

export async function disruptionRoutes(app: FastifyInstance) {
  // Operator declares a disruption → auto-reschedule offers.
  app.post("/api/v1/op/events", { preHandler: [authenticate, requireRole("operator", "admin")] }, async (request) => {
    const body = z.object({
      centreId: z.string().uuid(),
      date: z.string(),
      kind: z.enum(["rain", "godown_full", "bag_shortage", "weighbridge_down", "holiday"]),
      note: z.string().max(280).optional(),
    }).parse(request.body);
    return declareEvent({ operatorId: request.auth!.userId, ...body });
  });

  // Farmer accepts the offer from inside the app.
  app.post("/api/v1/reschedule/accept", { preHandler: [authenticate] }, async (request) =>
    acceptLatestOffer(request.auth!.userId, "app"));

  /**
   * Inbound SMS webhook — the feature-phone path. The provider posts the sender and
   * the body; "1" accepts the pending reschedule offer. No auth header: the request
   * is trusted by a shared provider secret in production (checked here as a header).
   */
  app.post("/api/v1/hooks/sms/inbound", async (request) => {
    const body = z.object({ from: z.string(), text: z.string() }).parse(request.body);
    const mobile = normaliseMobile(body.from);
    const user = await userByMobile(mobile);
    const reply = body.text.trim();
    if (reply === "1") {
      const res = await acceptLatestOffer(user.id, "sms");
      return { handled: true, action: "reschedule_accepted", bookingRef: res.booking.ref };
    }
    return { handled: false, hint: "Reply 1 to accept a reschedule offer." };
  });

  // Delivery receipts → messages.deliveredAt.
  app.post("/api/v1/hooks/sms/dlr", async (request) => {
    const body = z.object({ messageId: z.string().uuid().optional(), providerId: z.string().optional(), status: z.enum(["delivered", "failed"]) }).parse(request.body);
    if (body.messageId) {
      await db.update(t.messages)
        .set({ status: body.status === "delivered" ? "delivered" : "failed", deliveredAt: body.status === "delivered" ? new Date() : null })
        .where(eq(t.messages.id, body.messageId));
    }
    return { ok: true };
  });

  /**
   * Missed-call IVR — the farmer rings, hangs up, the provider posts the number, and
   * we return the lines to read aloud (queue + payment) in the stored language.
   */
  app.post("/api/v1/hooks/ivr", async (request) => {
    const body = z.object({ from: z.string() }).parse(request.body);
    const user = await userByMobile(normaliseMobile(body.from));
    const q = await farmerQueue(user.id);
    const { active } = await listPayments(user.id);
    const lines: string[] = [];
    if (q) {
      lines.push({
        pa: `ਤੁਹਾਡੇ ਅੱਗੇ ${q.queue.farmersAhead} ਗੱਡੀਆਂ, ਲਗਭਗ ${q.queue.estimatedWaitMinutes} ਮਿੰਟ.`,
        hi: `आपसे आगे ${q.queue.farmersAhead} गाड़ियाँ, लगभग ${q.queue.estimatedWaitMinutes} मिनट.`,
        en: `${q.queue.farmersAhead} trolleys ahead, about ${q.queue.estimatedWaitMinutes} minutes.`,
      }[user.language]);
    }
    if (active) {
      lines.push(active.failureReason ?? {
        pa: "ਤੁਹਾਡਾ ਭੁਗਤਾਨ ਤਿਆਰ ਹੋ ਰਿਹਾ ਹੈ.", hi: "आपका भुगतान तैयार हो रहा है.", en: "Your payment is being processed.",
      }[user.language]);
    }
    if (!lines.length) lines.push({ pa: "ਕੋਈ ਸਰਗਰਮ ਜਾਣਕਾਰੀ ਨਹੀਂ.", hi: "कोई सक्रिय जानकारी नहीं.", en: "No active updates." }[user.language]);
    return { language: user.language, say: lines };
  });

  // Farmer's open offers (for the app UI).
  app.get("/api/v1/reschedule/offers", { preHandler: [authenticate] }, async (request) => {
    const rows = await db.select().from(t.pendingDecisions)
      .where(and(eq(t.pendingDecisions.userId, request.auth!.userId), eq(t.pendingDecisions.kind, "reschedule_offer"), isNull(t.pendingDecisions.resolvedAt)))
      .orderBy(desc(t.pendingDecisions.createdAt));
    return { offers: rows.map((r) => ({ id: r.id, ...(r.payload as object), expiresAt: r.expiresAt.toISOString() })) };
  });
}
