import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import * as t from "../../db/schema.js";
import { authenticate } from "../../http/auth.js";
import { withIdempotency } from "../../http/idempotency.js";
import { book, cancel, reschedule, listBookings } from "./service.js";
import { deriveJourneyStage } from "../../domain/journey.js";

const bookBody = z.object({
  slotId: z.string().uuid(),
  qtl: z.number().positive().max(10_000),
  crop: z.string().min(2).max(40).optional(),
  trolleys: z.number().int().positive().max(20).optional(),
});

const rescheduleBody = z.object({ slotId: z.string().uuid() });

export async function bookingRoutes(app: FastifyInstance) {
  app.get("/api/v1/bookings", { preHandler: [authenticate] }, async (request) => ({
    bookings: await listBookings(request.auth!.userId),
  }));

  // Idempotent: a rural double-tap replays the first confirmation, gate OTP and all.
  app.post("/api/v1/bookings", { preHandler: [authenticate] }, async (request, reply) => {
    const body = bookBody.parse(request.body);
    const { status, body: result } = await withIdempotency(
      request,
      { userId: request.auth!.userId, route: "POST /bookings" },
      async () => ({ status: 201, body: await book({ userId: request.auth!.userId, ...body }) }),
    );
    return reply.status(status).send(result);
  });

  app.post("/api/v1/bookings/:ref/reschedule", { preHandler: [authenticate] }, async (request, reply) => {
    const { ref } = z.object({ ref: z.string() }).parse(request.params);
    const body = rescheduleBody.parse(request.body);
    const { status, body: result } = await withIdempotency(
      request,
      { userId: request.auth!.userId, route: "POST /bookings/reschedule" },
      async () => ({ status: 200, body: await reschedule(request.auth!.userId, ref, body.slotId) }),
    );
    return reply.status(status).send(result);
  });

  app.post("/api/v1/bookings/:ref/cancel", { preHandler: [authenticate] }, async (request) => {
    const { ref } = z.object({ ref: z.string() }).parse(request.params);
    return cancel(request.auth!.userId, ref);
  });

  /**
   * GET /api/v1/journey — farmer's produce journey for their most recent active booking.
   * Derives stage (1–5) from existing tables; no new columns needed.
   *   1 Booked  2 Arrived  3 Weighed  4 Payment Processing  5 Paid
   */
  app.get("/api/v1/journey", { preHandler: [authenticate] }, async (request) => {
    const userId = request.auth!.userId;

    const [booking] = await db
      .select({ id: t.bookings.id, ref: t.bookings.ref, crop: t.bookings.crop, date: t.bookings.date, status: t.bookings.status })
      .from(t.bookings)
      .where(eq(t.bookings.userId, userId))
      .orderBy(desc(t.bookings.createdAt))
      .limit(1);

    if (!booking) return { journey: null };

    const [lot] = await db
      .select({ id: t.lots.id, netQtl: t.lots.netQtl, amount: t.lots.amount })
      .from(t.lots)
      .where(eq(t.lots.bookingId, booking.id))
      .limit(1);

    const [payment] = lot
      ? await db.select({ status: t.payments.status }).from(t.payments).where(eq(t.payments.lotId, lot.id)).limit(1)
      : [];

    const stage = deriveJourneyStage({ bookingStatus: booking.status, hasLot: !!lot, paymentStatus: payment?.status });

    return {
      journey: {
        stage,
        ref: booking.ref,
        crop: booking.crop,
        date: booking.date,
        netQtl: lot ? Number(lot.netQtl) : null,
        amount: lot ? Number(lot.amount) : null,
      },
    };
  });
}
