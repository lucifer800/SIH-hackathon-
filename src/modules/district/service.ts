import { and, eq, gte, lte, inArray, sql as raw } from "drizzle-orm";
import { db } from "../../db/client.js";
import * as t from "../../db/schema.js";
import { istDate, addDays } from "../../domain/capacity.js";
import { IMPACT_TARGETS, medianWaitMinutes, peakToAverage, failureSurfacedInTime, knewTheirTurnPct } from "../../domain/impact.js";

/**
 * District dashboard read-models — the deck's "real arrival forecast lets the
 * centre pre-position bags, labour and lorries", plus payment pendency ageing
 * against the 48-hour DBT promise.
 *
 * These are reads over the same rows the operator and farmer paths write, so the
 * district view can never disagree with the floor.
 */

export async function overview(district: string, date = istDate()) {
  const centres = await db.select().from(t.centres).where(eq(t.centres.district, district));

  const perCentre = [];
  for (const c of centres) {
    const [day] = await db.select().from(t.centreDays)
      .where(and(eq(t.centreDays.centreId, c.id), eq(t.centreDays.date, date))).limit(1);

    const [served] = await db
      .select({ n: raw<number>`count(*)::int` })
      .from(t.tokens)
      .where(and(eq(t.tokens.centreId, c.id), eq(t.tokens.date, date), raw`${t.tokens.servedAt} is not null`));
    const [checkedIn] = await db
      .select({ n: raw<number>`count(*)::int` })
      .from(t.tokens)
      .where(and(eq(t.tokens.centreId, c.id), eq(t.tokens.date, date)));

    perCentre.push({
      centreId: c.id,
      name: c.name,
      capacityQtl: day?.capacityQtl ?? 0,
      bookedQtl: day ? Number(day.bookedQtl) : 0,
      bookedTrolleys: day?.bookedTrolleys ?? 0,
      arrivals: checkedIn?.n ?? 0,
      served: served?.n ?? 0,
      utilisationPct: day && day.capacityQtl > 0 ? Math.round((Number(day.bookedQtl) / day.capacityQtl) * 100) : 0,
      status: day?.status ?? "closed",
    });
  }

  // Payment pendency across the district, aged against the 48-hour promise.
  const centreIds = centres.map((c) => c.id);
  const ageing = { initiated: 0, over48h: 0, failed: 0, credited: 0 };
  if (centreIds.length) {
    const pays = await db
      .select({ status: t.payments.status, initiatedAt: t.payments.initiatedAt })
      .from(t.payments)
      .innerJoin(t.lots, eq(t.lots.id, t.payments.lotId))
      .where(raw`${t.lots.centreId} in ${centreIds}`);
    for (const p of pays) {
      if (p.status === "credited") ageing.credited++;
      else if (p.status === "failed" || p.status === "returned") ageing.failed++;
      else if (p.status === "initiated") {
        ageing.initiated++;
        if (p.initiatedAt && (Date.now() - p.initiatedAt.getTime()) / 3_600_000 > IMPACT_TARGETS.dbtPromiseHours) ageing.over48h++;
      }
    }
  }

  return {
    district,
    date,
    centres: perCentre,
    totals: {
      capacityQtl: perCentre.reduce((s, c) => s + c.capacityQtl, 0),
      bookedQtl: perCentre.reduce((s, c) => s + c.bookedQtl, 0),
      arrivals: perCentre.reduce((s, c) => s + c.arrivals, 0),
      served: perCentre.reduce((s, c) => s + c.served, 0),
    },
    payments: ageing,
  };
}

/** Next `days` days of booked quintals per centre — the pre-positioning forecast. */
export async function forecast(district: string, days = 7) {
  const centres = await db.select().from(t.centres).where(eq(t.centres.district, district));
  const from = istDate();
  const to = addDays(from, days - 1);

  const out = [];
  for (const c of centres) {
    const rows = await db.select().from(t.centreDays)
      .where(and(eq(t.centreDays.centreId, c.id), gte(t.centreDays.date, from), lte(t.centreDays.date, to)))
      .orderBy(t.centreDays.date);
    out.push({
      centreId: c.id,
      name: c.name,
      days: rows.map((d) => ({
        date: d.date,
        capacityQtl: d.capacityQtl,
        bookedQtl: Number(d.bookedQtl),
        fillPct: d.capacityQtl > 0 ? Math.round((Number(d.bookedQtl) / d.capacityQtl) * 100) : 0,
      })),
    });
  }
  return { district, from, to, centres: out };
}


/**
 * The four impact claims from slide 5, MEASURED from real rows — the pitch exhibit.
 * Each returns a number the system actually achieved, next to the deck's target.
 */
export async function impact(district: string) {
  const centres = await db.select({ id: t.centres.id }).from(t.centres).where(eq(t.centres.district, district));
  const centreIds = centres.map((c) => c.id);
  if (!centreIds.length) return { district, targets: IMPACT_TARGETS, measured: null };

  // 1. Median wait: checked-in → served, in minutes, for served tokens.
  const served = await db
    .select({ checkedInAt: t.tokens.checkedInAt, servedAt: t.tokens.servedAt })
    .from(t.tokens)
    .where(and(inArray(t.tokens.centreId, centreIds), raw`${t.tokens.servedAt} is not null`));
  const waits = served.map((r) => Math.round((r.servedAt!.getTime() - r.checkedInAt.getTime()) / 60000)).filter((n) => n >= 0);

  // 2. Peak-to-average arrivals: check-ins bucketed by hour.
  const arrivals = await db
    .select({ hour: raw<number>`extract(hour from ${t.tokens.checkedInAt})::int`, n: raw<number>`count(*)::int` })
    .from(t.tokens)
    .where(inArray(t.tokens.centreId, centreIds))
    .groupBy(raw`extract(hour from ${t.tokens.checkedInAt})`);
  const perHour = arrivals.map((a) => a.n);

  // 3. Payment failures surfaced within 24h: initiatedAt → the failure message sentAt.
  const failed = await db
    .select({ initiatedAt: t.payments.initiatedAt, userId: t.payments.userId, updatedAt: t.payments.updatedAt })
    .from(t.payments)
    .innerJoin(t.lots, eq(t.lots.id, t.payments.lotId))
    .where(and(inArray(t.lots.centreId, centreIds), inArray(t.payments.status, ["failed", "returned"])));
  let surfaced = 0;
  for (const f of failed) {
    const [msg] = await db.select({ sentAt: t.messages.sentAt }).from(t.messages)
      .where(and(eq(t.messages.userId, f.userId), eq(t.messages.templateId, "payment_failed")))
      .orderBy(t.messages.createdAt).limit(1);
    if (failureSurfacedInTime(f.initiatedAt ?? f.updatedAt, msg?.sentAt ?? null)) surfaced++;
  }

  // 4. Knew their turn: served farmers who got a booking confirmation before arriving.
  const servedCount = served.length;
  let withNotice = 0;
  if (servedCount) {
    const [noticeRow] = await db
      .select({ n: raw<number>`count(distinct ${t.messages.userId})::int` })
      .from(t.messages)
      .where(eq(t.messages.templateId, "booking_confirmed"));
    withNotice = Math.min(servedCount, noticeRow?.n ?? 0);
  }

  return {
    district,
    targets: IMPACT_TARGETS,
    measured: {
      medianWaitMinutes: medianWaitMinutes(waits),
      sampleServed: servedCount,
      peakToAverage: peakToAverage(perHour),
      paymentFailuresSurfacedIn24hPct: failed.length ? Math.round((surfaced / failed.length) * 100) : null,
      knewTheirTurnPct: knewTheirTurnPct(servedCount, withNotice),
    },
  };
}
