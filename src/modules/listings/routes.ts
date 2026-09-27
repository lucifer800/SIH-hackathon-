import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../db/client.js";
import * as t from "../../db/schema.js";
import { authenticate } from "../../http/auth.js";
import { istDate } from "../../domain/capacity.js";

const CROPS = ["Wheat", "Paddy", "Maize"] as const;

const createBody = z.object({
  crop: z.enum(CROPS),
  qtl: z.number().positive().max(500),
  askingPrice: z.number().positive().max(10_000),
  village: z.string().min(1).max(100),
  district: z.string().min(1).max(100),
});

export async function listingRoutes(app: FastifyInstance) {
  // Public: browse listings, filterable by crop + district
  app.get("/api/v1/listings", async (request) => {
    const { crop, district } = z.object({
      crop: z.enum(CROPS).optional(),
      district: z.string().optional(),
    }).parse(request.query);

    const today = istDate();
    const conditions = [
      eq(t.listings.status, "active"),
      gte(t.listings.expiresAt, sql`${today}::date`),
    ];
    if (crop) conditions.push(eq(t.listings.crop, crop));
    if (district) conditions.push(eq(t.listings.district, district));

    const rows = await db
      .select({
        id: t.listings.id,
        crop: t.listings.crop,
        qtl: t.listings.qtl,
        askingPrice: t.listings.askingPrice,
        village: t.listings.village,
        district: t.listings.district,
        createdAt: t.listings.createdAt,
        farmerName: t.users.name,
        farmerMobile: t.users.mobile,
      })
      .from(t.listings)
      .innerJoin(t.users, eq(t.users.id, t.listings.userId))
      .where(and(...conditions))
      .orderBy(desc(t.listings.createdAt))
      .limit(50);

    return { listings: rows.map((r) => ({ ...r, qtl: Number(r.qtl), askingPrice: Number(r.askingPrice) })) };
  });

  // Auth: post a new listing (expires in 7 days)
  app.post("/api/v1/listings", { preHandler: [authenticate] }, async (request, reply) => {
    const body = createBody.parse(request.body);
    const userId = request.auth!.userId;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const [created] = await db.insert(t.listings)
      .values({ ...body, userId, qtl: String(body.qtl), askingPrice: String(body.askingPrice), expiresAt })
      .returning({ id: t.listings.id, crop: t.listings.crop, qtl: t.listings.qtl, askingPrice: t.listings.askingPrice });

    return reply.status(201).send({ ...created, qtl: Number(created.qtl), askingPrice: Number(created.askingPrice) });
  });

  // Auth: mark own listing as sold
  app.patch("/api/v1/listings/:id/sold", { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await db.update(t.listings).set({ status: "sold" })
      .where(and(eq(t.listings.id, id), eq(t.listings.userId, request.auth!.userId)));
    return reply.status(204).send();
  });

  // Auth: delete own listing
  app.delete("/api/v1/listings/:id", { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await db.delete(t.listings)
      .where(and(eq(t.listings.id, id), eq(t.listings.userId, request.auth!.userId)));
    return reply.status(204).send();
  });
}
