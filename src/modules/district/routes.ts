import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, requireRole } from "../../http/auth.js";
import { overview, forecast, impact } from "./service.js";

export async function districtRoutes(app: FastifyInstance) {
  app.get("/api/v1/district/:district/overview", { preHandler: [authenticate, requireRole("district", "admin")] }, async (request) => {
    const { district } = z.object({ district: z.string() }).parse(request.params);
    const q = z.object({ date: z.string().optional() }).parse(request.query);
    return overview(decodeURIComponent(district), q.date);
  });

  app.get("/api/v1/district/:district/impact", { preHandler: [authenticate, requireRole("district", "admin")] }, async (request) => {
    const { district } = z.object({ district: z.string() }).parse(request.params);
    return impact(decodeURIComponent(district));
  });

  app.get("/api/v1/district/:district/forecast", { preHandler: [authenticate, requireRole("district", "admin")] }, async (request) => {
    const { district } = z.object({ district: z.string() }).parse(request.params);
    const q = z.object({ days: z.coerce.number().int().min(1).max(30).default(7) }).parse(request.query);
    return forecast(decodeURIComponent(district), q.days);
  });
}
