import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../../http/auth.js";
import { ask } from "./service.js";

export async function assistRoutes(app: FastifyInstance) {
  // Voice assist (Sunrise 07): text in (from speech-to-text), spoken answer out.
  app.post("/api/v1/assist/ask", { preHandler: [authenticate] }, async (request) => {
    const body = z.object({ text: z.string().min(1).max(500), language: z.enum(["pa", "hi", "en"]).optional() }).parse(request.body);
    return ask(request.auth!.userId, body.text, body.language ?? request.auth!.language);
  });
}
