import type { FastifyInstance } from "fastify";
import { authenticate, requireRole } from "../../http/auth.js";
import { checkWeatherDisruptions } from "./service.js";

export async function weatherRoutes(app: FastifyInstance) {
  // Manual trigger for the demo; the worker runs this every 30 min in production.
  app.post("/api/v1/admin/weather-check", { preHandler: [authenticate, requireRole("district", "admin")] }, async () => checkWeatherDisruptions());
}
