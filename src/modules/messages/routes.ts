import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import * as t from "../../db/schema.js";
import { authenticate } from "../../http/auth.js";
import { notFound } from "../../http/errors.js";

/**
 * The alerts & SMS log (Sunrise 06). Every outbound message the farmer received
 * lives here — "the promise is nothing is lost". Newest first; the unread ones
 * are what the screen renders dark.
 */
export async function messageRoutes(app: FastifyInstance) {
  app.get("/api/v1/messages", { preHandler: [authenticate] }, async (request) => {
    const rows = await db.select().from(t.messages)
      .where(eq(t.messages.userId, request.auth!.userId))
      .orderBy(desc(t.messages.createdAt))
      .limit(100);
    return {
      unread: rows.filter((m) => !m.readAt).length,
      messages: rows.map((m) => ({
        id: m.id, category: m.category, channel: m.channel, body: m.body,
        createdAt: m.createdAt.toISOString(), read: m.readAt != null,
      })),
    };
  });

  app.post("/api/v1/messages/:id/read", { preHandler: [authenticate] }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const [m] = await db.update(t.messages).set({ readAt: new Date() })
      .where(and(eq(t.messages.id, id), eq(t.messages.userId, request.auth!.userId)))
      .returning();
    if (!m) throw notFound("Message");
    return { id: m.id, read: true };
  });
}
