import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import * as t from "../../db/schema.js";
import { authenticate, requireRole } from "../../http/auth.js";
import { ratesFor, ingestFromDataGov } from "./service.js";

export async function rateRoutes(app: FastifyInstance) {
  // Crop rates for the farmer (Sunrise 05). Uses their home mandi if known.
  app.get("/api/v1/rates", { preHandler: [authenticate] }, async (request) => {
    const q = z.object({ crop: z.string().default("Wheat"), mandi: z.string().optional() }).parse(request.query);
    const [holding] = await db.select().from(t.holdings).where(eq(t.holdings.userId, request.auth!.userId)).limit(1);
    return ratesFor(q.crop, q.mandi ?? undefined);
  });

  // Manual ingest trigger (a scheduled worker calls this daily in production).
  app.post("/api/v1/rates/ingest", { preHandler: [authenticate, requireRole("district", "admin")] }, async () => ingestFromDataGov());
}
