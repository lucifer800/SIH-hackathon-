import { and, desc, eq, gte } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../db/client.js";
import * as t from "../../db/schema.js";
import { authenticate } from "../../http/auth.js";
import { channel } from "../../channels/index.js";
import { istDate } from "../../domain/capacity.js";

/** Daily job: for every active alert, check if today's rate at any mandi hit the target → SMS once. */
export async function checkPriceAlerts(): Promise<{ fired: number }> {
  const alerts = await db
    .select({ id: t.priceAlerts.id, userId: t.priceAlerts.userId, crop: t.priceAlerts.crop, target: t.priceAlerts.targetPrice, mobile: t.users.mobile, lang: t.users.language })
    .from(t.priceAlerts)
    .innerJoin(t.users, eq(t.users.id, t.priceAlerts.userId))
    .where(eq(t.priceAlerts.active, true));

  const today = istDate();
  let fired = 0;

  for (const alert of alerts) {
    const [best] = await db
      .select({ mandi: t.rates.mandi, price: t.rates.modalPrice })
      .from(t.rates)
      .where(and(eq(t.rates.crop, alert.crop), eq(t.rates.date, today), gte(t.rates.modalPrice, alert.target)))
      .orderBy(desc(t.rates.modalPrice))
      .limit(1);

    if (!best) continue;

    await channel().send({
      userId: alert.userId,
      to: alert.mobile,
      templateId: "price_alert",
      language: alert.lang,
      vars: { crop: alert.crop, mandi: best.mandi, price: Math.round(Number(best.price)), target: Math.round(Number(alert.target)) },
    });

    // Deactivate after firing so the farmer isn't spammed daily.
    await db.update(t.priceAlerts).set({ active: false }).where(eq(t.priceAlerts.id, alert.id));
    fired++;
  }

  return { fired };
}

const alertBody = z.object({
  crop: z.enum(["Wheat", "Paddy", "Maize"]),
  targetPrice: z.number().positive().max(10_000),
});

export async function priceAlertRoutes(app: FastifyInstance) {
  // Set or replace an alert for this crop (one active alert per user per crop).
  app.post("/api/v1/rates/alert", { preHandler: [authenticate] }, async (request, reply) => {
    const { crop, targetPrice } = alertBody.parse(request.body);
    const userId = request.auth!.userId;

    await db.update(t.priceAlerts).set({ active: false })
      .where(and(eq(t.priceAlerts.userId, userId), eq(t.priceAlerts.crop, crop)));

    const [created] = await db.insert(t.priceAlerts)
      .values({ userId, crop, targetPrice: String(targetPrice) })
      .returning({ id: t.priceAlerts.id, crop: t.priceAlerts.crop, targetPrice: t.priceAlerts.targetPrice });

    return reply.status(201).send(created);
  });

  app.get("/api/v1/rates/alerts", { preHandler: [authenticate] }, async (request) => {
    const rows = await db.select({ id: t.priceAlerts.id, crop: t.priceAlerts.crop, targetPrice: t.priceAlerts.targetPrice })
      .from(t.priceAlerts)
      .where(and(eq(t.priceAlerts.userId, request.auth!.userId), eq(t.priceAlerts.active, true)));
    return { alerts: rows };
  });

  app.delete("/api/v1/rates/alert/:id", { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await db.update(t.priceAlerts).set({ active: false })
      .where(and(eq(t.priceAlerts.id, id), eq(t.priceAlerts.userId, request.auth!.userId)));
    return reply.status(204).send();
  });
}
