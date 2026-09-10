import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, requireRole } from "../../http/auth.js";
import { fileGrievance, listMine, listForDistrict, resolve, CATEGORIES } from "./service.js";

export async function grievanceRoutes(app: FastifyInstance) {
  app.post("/api/v1/grievances", { preHandler: [authenticate] }, async (request, reply) => {
    const body = z.object({
      category: z.enum(CATEGORIES),
      body: z.string().min(4).max(1000),
      receiptNo: z.string().optional(),
      bookingRef: z.string().optional(),
    }).parse(request.body);
    const g = await fileGrievance({ userId: request.auth!.userId, language: request.auth!.language, ...body });
    return reply.status(201).send(g);
  });

  app.get("/api/v1/grievances", { preHandler: [authenticate] }, async (request) => ({ grievances: await listMine(request.auth!.userId) }));

  app.get("/api/v1/district/grievances", { preHandler: [authenticate, requireRole("district", "admin")] }, async (request) => {
    const q = z.object({ status: z.enum(["open", "acknowledged", "resolved", "rejected"]).optional() }).parse(request.query);
    return { grievances: await listForDistrict(q.status) };
  });

  app.post("/api/v1/district/grievances/:ref/resolve", { preHandler: [authenticate, requireRole("district", "admin")] }, async (request) => {
    const { ref } = z.object({ ref: z.string() }).parse(request.params);
    const body = z.object({ resolution: z.string().min(4).max(1000), reject: z.boolean().optional() }).parse(request.body);
    return resolve(request.auth!.userId, ref, body.resolution, body.reject ?? false);
  });
}
