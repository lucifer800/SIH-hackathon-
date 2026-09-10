import type { FastifyInstance } from "fastify";
import { authenticate, requireRole } from "../../http/auth.js";
import { runMaintenance, sweepNoShows } from "./service.js";

export async function maintenanceRoutes(app: FastifyInstance) {
  // Manual trigger for the demo; the worker runs these on a schedule in production.
  app.post("/api/v1/op/sweep", { preHandler: [authenticate, requireRole("operator", "district", "admin")] }, async () => sweepNoShows());
  app.post("/api/v1/admin/maintenance", { preHandler: [authenticate, requireRole("admin")] }, async () => runMaintenance());
}
