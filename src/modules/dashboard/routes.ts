import type { FastifyInstance } from "fastify";
import { authenticate } from "../../http/auth.js";
import { dashboard } from "./service.js";

export async function dashboardRoutes(app: FastifyInstance) {
  // Sunrise home screen (02) — one call.
  app.get("/api/v1/dashboard", { preHandler: [authenticate] }, async (request) => dashboard(request.auth!.userId));
}
