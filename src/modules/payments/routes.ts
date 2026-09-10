import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, requireRole } from "../../http/auth.js";
import { initiatePending, applyReturnFile, listPayments } from "./service.js";

const returnRow = z.object({
  receiptNo: z.string(),
  status: z.enum(["credited", "failed", "returned"]),
  bankCode: z.string().optional(),
  utr: z.string().optional(),
});

export async function paymentRoutes(app: FastifyInstance) {
  // farmer payment tracker
  app.get("/api/v1/payments", { preHandler: [authenticate] }, async (request) => listPayments(request.auth!.userId));

  // DBT run — flip pending → initiated (operator/district/admin)
  app.post("/api/v1/payments/initiate", { preHandler: [authenticate, requireRole("operator", "district", "admin")] }, async (request) => {
    const q = z.object({ centreId: z.string().uuid().optional() }).parse(request.body ?? {});
    return initiatePending(request.auth!.userId, q.centreId);
  });

  /**
   * Bank return-file import. In production this is the provider/treasury webhook;
   * here it accepts the parsed rows directly so a sample CSV can drive the demo.
   * Restricted to district/admin — it moves everyone's money.
   */
  app.post("/api/v1/hooks/bank/return-file", { preHandler: [authenticate, requireRole("district", "admin")] }, async (request) => {
    const body = z.object({ rows: z.array(returnRow).min(1).max(5000) }).parse(request.body);
    return applyReturnFile(request.auth!.userId, body.rows);
  });
}
