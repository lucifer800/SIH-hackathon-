import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import * as t from "../../db/schema.js";
import { authenticate, requireRole } from "../../http/auth.js";
import { dayPack, applyBatch, type SyncOp } from "./service.js";
import { istDate } from "../../domain/capacity.js";

const opSchema = z.discriminatedUnion("type", [
  z.object({ clientUuid: z.string().uuid(), type: z.literal("checkin"), bookingRef: z.string(), gateOtp: z.string().regex(/^\d{4}$/), vehicleNo: z.string().min(3), lane: z.number().int().positive().optional(), at: z.string().optional() }),
  z.object({ clientUuid: z.string().uuid(), type: z.literal("serve_next"), lane: z.number().int().positive(), at: z.string().optional() }),
  z.object({ clientUuid: z.string().uuid(), type: z.literal("lot"), bookingRef: z.string(), moisturePct: z.number(), grossQtl: z.number().positive(), tareQtl: z.number().min(0), variety: z.string().optional() }),
]);

export async function syncRoutes(app: FastifyInstance) {
  const operatorCentre = async (userId: string) =>
    (await db.select({ c: t.users.centreId }).from(t.users).where(eq(t.users.id, userId)).limit(1))[0]?.c ?? null;

  // Pull the day pack to run offline.
  app.get("/api/v1/op/centre/:id/day/:date", { preHandler: [authenticate, requireRole("operator", "admin")] }, async (request) => {
    const { id, date } = z.object({ id: z.string().uuid(), date: z.string() }).parse(request.params);
    return dayPack(id, date);
  });

  // Replay the outbox. Idempotent per operation clientUuid; merged by centre + date.
  app.post("/api/v1/op/sync", { preHandler: [authenticate, requireRole("operator", "admin")] }, async (request) => {
    const body = z.object({
      centreId: z.string().uuid(),
      date: z.string().optional(),
      operations: z.array(opSchema).max(500),
    }).parse(request.body);

    return applyBatch({
      operatorId: request.auth!.userId,
      operatorRole: request.auth!.role,
      operatorCentreId: request.auth!.role === "operator" ? await operatorCentre(request.auth!.userId) : null,
      centreId: body.centreId,
      date: body.date ?? istDate(),
      operations: body.operations as SyncOp[],
    });
  });
}
