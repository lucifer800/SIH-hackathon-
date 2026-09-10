import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import * as t from "../../db/schema.js";
import { farmerQueue } from "../queue/service.js";
import { listPayments } from "../payments/service.js";
import { IST_OFFSET } from "../../domain/capacity.js";

/**
 * One aggregate call for the farmer home screen (Sunrise 02) — profile, the next
 * appointment, live queue, procurement value, the payment to watch, and the unread
 * count. Everything the home screen renders, in a single round trip, from the same
 * services the individual screens use.
 */
export async function dashboard(userId: string) {
  const [user] = await db.select().from(t.users).where(eq(t.users.id, userId)).limit(1);
  const [holding] = await db.select().from(t.holdings).where(eq(t.holdings.userId, userId)).limit(1);

  // Next upcoming booking (booked or checked_in), earliest first.
  const [next] = await db
    .select({ b: t.bookings, centre: t.centres.name, start: t.slots.windowStart, end: t.slots.windowEnd })
    .from(t.bookings)
    .innerJoin(t.centres, eq(t.centres.id, t.bookings.centreId))
    .innerJoin(t.slots, eq(t.slots.id, t.bookings.slotId))
    .where(and(eq(t.bookings.userId, userId), inStatus(t.bookings.status)))
    .orderBy(t.slots.windowStart)
    .limit(1);

  const queue = await farmerQueue(userId);
  const { active, payments } = await listPayments(userId);
  const procurementValue = payments.filter((p) => p.status === "credited").reduce((s, p) => s + p.amount, 0);

  const [unreadRow] = await db
    .select({ unread: countUnread() })
    .from(t.messages)
    .where(and(eq(t.messages.userId, userId), isNull(t.messages.readAt)));
  const unread = unreadRow?.unread ?? 0;

  const time = (d: Date) => new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(d);
  const dateLabel = (d: string) => new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(new Date(`${d}T12:00:00${IST_OFFSET}`));

  return {
    user: user ? { id: user.id, name: user.name, mobile: user.mobile, language: user.language, district: user.district ?? "", priorityScore: user.priorityScore, noShowCount: user.noShowCount } : null,
    holding: holding ? { village: holding.village, district: holding.district, areaHa: Number(holding.areaHa), crop: holding.crop, entitlementQtl: Number(holding.entitlementQtl), usedQtl: Number(holding.usedQtl) } : null,
    appointment: next ? {
      ref: next.b.ref, centre: next.centre, date: next.b.date, dateLabel: dateLabel(next.b.date),
      slot: time(next.start), slotEnd: time(next.end), crop: next.b.crop, qtl: Number(next.b.qtlDeclared),
      pool: next.b.pool, status: next.b.status,
    } : null,
    queue: queue?.queue ?? null,
    procurementValue,
    payment: active,
    unreadNotifications: unread,
  };
}

// helpers keep the query readable without over-typing
import { inArray, sql as raw } from "drizzle-orm";
function inStatus(col: typeof t.bookings.status) { return inArray(col, ["booked", "checked_in"]); }
function countUnread() { return raw<number>`count(*)::int`; }
