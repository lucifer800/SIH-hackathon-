import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import * as t from "../../db/schema.js";
import { authenticate, requireRole } from "../../http/auth.js";
import { withIdempotency } from "../../http/idempotency.js";
import { recordLot, listLots, receiptFor } from "./service.js";

const lotBody = z.object({
  bookingRef: z.string().min(4),
  moisturePct: z.number().min(0).max(100),
  grossQtl: z.number().positive().max(100000),
  tareQtl: z.number().min(0).max(100000),
  variety: z.string().max(40).optional(),
  ratePerQtl: z.number().positive().max(100000).optional(),
  normPct: z.number().min(0).max(100).optional(),
});

export async function lotRoutes(app: FastifyInstance) {
  // operator records the weighment → immutable receipt
  app.post("/api/v1/op/lots", { preHandler: [authenticate, requireRole("operator", "admin")] }, async (request, reply) => {
    const body = lotBody.parse(request.body);
    const [op] = await db.select({ centreId: t.users.centreId }).from(t.users).where(eq(t.users.id, request.auth!.userId)).limit(1);
    const { status, body: result } = await withIdempotency(
      request,
      { userId: request.auth!.userId, route: "POST /op/lots" },
      async () => ({
        status: 201,
        body: await recordLot({
          operatorId: request.auth!.userId, operatorRole: request.auth!.role,
          operatorCentreId: request.auth!.role === "operator" ? op?.centreId ?? null : null,
          ...body,
        }),
      }),
    );
    return reply.status(status).send(result);
  });

  // farmer's records
  app.get("/api/v1/lots", { preHandler: [authenticate] }, async (request) => ({ lots: await listLots(request.auth!.userId) }));
  app.get("/api/v1/lots/:receiptNo/receipt", { preHandler: [authenticate] }, async (request) => {
    const { receiptNo } = z.object({ receiptNo: z.string() }).parse(request.params);
    return receiptFor(request.auth!.userId, receiptNo);
  });
}
