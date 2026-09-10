import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../../http/auth.js";
import { withIdempotency } from "../../http/idempotency.js";
import { book, cancel, reschedule, listBookings } from "./service.js";

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
}
