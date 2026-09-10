import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "../../db/client.js";
import * as t from "../../db/schema.js";
import { WHEAT_MSP } from "../../domain/payments.js";
import { istDate, addDays } from "../../domain/capacity.js";

/**
 * Crop rates — the price that decides whether the trip is worth it (Sunrise 05).
 *
 * The deck is explicit that this must be "decision help, not raw data": today's
 * price, a 7-day trend, and nearby mandis so a farmer can weigh a higher rate one
 * district over against the cost of getting there.
 *
 * Live ingest is data.gov.in's Agmarknet feed (needs DATA_GOV_API_KEY); until that
 * is wired, `seedRates` writes realistic values so the screen and the voice assist
 * both work in a demo.
 */

const MSP: Record<string, number> = { Wheat: WHEAT_MSP, Paddy: 2300, Maize: 2225 };

export interface RateView {
  crop: string;
  today: number;
  msp: number;
  delta: number;                 // vs 7 days ago
  trend: { day: string; value: number }[];
  nearby: { mandi: string; price: number }[];
  advice: string;
}

/** Seeds a week of believable rates for a district's mandis. Idempotent per day. */
export async function seedRates(district = "Ludhiana", crops = ["Wheat", "Paddy", "Maize"]) {
  const mandis = [
    { mandi: "Khanna", jitter: 40 },
    { mandi: "Jagraon", jitter: 15 },
    { mandi: "Raikot", jitter: -20 },
  ];
  let inserted = 0;
  for (const crop of crops) {
    const base = MSP[crop] ?? 2000;
    for (let d = 6; d >= 0; d--) {
      const date = addDays(istDate(), -d);
      // A gentle upward drift toward harvest, plus per-mandi jitter.
      const drift = Math.round((6 - d) * 8);
      for (const m of mandis) {
        const modal = base + drift + m.jitter;
        await db.insert(t.rates).values({
          crop, mandi: m.mandi, district, date, msp: String(base), modalPrice: String(modal), source: "seed",
        }).onConflictDoNothing();
        inserted++;
      }
    }
  }
  return { inserted };
}

/**
 * If DATA_GOV_API_KEY is set, this is where the real Agmarknet pull goes. Kept as
 * a named seam so L5 can flip to live data without touching the route or the view.
 */
export async function ingestFromDataGov(): Promise<{ inserted: number; source: string }> {
  // Real implementation: fetch https://api.data.gov.in/resource/<agmarknet>?api-key=...
  // parse commodity/market/modal_price, upsert into `rates`. Deferred to a live key.
  const r = await seedRates();
  return { inserted: r.inserted, source: "seed (set DATA_GOV_API_KEY for live Agmarknet)" };
}

export async function ratesFor(crop: string, homeMandi?: string): Promise<RateView> {
  const from = addDays(istDate(), -6);
  const rows = await db
    .select()
    .from(t.rates)
    .where(and(eq(t.rates.crop, crop), gte(t.rates.date, from)))
    .orderBy(desc(t.rates.date));

  const msp = Number(rows[0]?.msp ?? MSP[crop] ?? 2000);

  // Trend: modal price at the home mandi (or the average) per day, oldest → newest.
  const byDate = new Map<string, number[]>();
  for (const r of rows) {
    if (homeMandi && r.mandi !== homeMandi) continue;
    const arr = byDate.get(r.date) ?? [];
    arr.push(Number(r.modalPrice));
    byDate.set(r.date, arr);
  }
  // If the home mandi has no rows, fall back to all mandis.
  if (byDate.size === 0) {
    for (const r of rows) {
      const arr = byDate.get(r.date) ?? [];
      arr.push(Number(r.modalPrice));
      byDate.set(r.date, arr);
    }
  }
  const trend = [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, vals]) => ({ day, value: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) }));

  const today = trend.at(-1)?.value ?? msp;
  const weekAgo = trend[0]?.value ?? today;
  const delta = today - weekAgo;

  // Nearby comparison: latest price per mandi, best first.
  const latestDate = rows[0]?.date;
  const nearby = rows
    .filter((r) => r.date === latestDate)
    .map((r) => ({ mandi: r.mandi, price: Number(r.modalPrice) }))
    .sort((a, b) => b.price - a.price);

  return { crop, today, msp, delta, trend, nearby, advice: buildAdvice(crop, today, msp, nearby, homeMandi) };
}

/** Decision help, not raw data: is a higher mandi worth the travel? */
function buildAdvice(crop: string, today: number, msp: number, nearby: RateView["nearby"], homeMandi?: string): string {
  if (!nearby.length) return `${crop} is at ₹${today}/qtl today.`;
  const best = nearby[0]!;
  const home = homeMandi ? nearby.find((n) => n.mandi === homeMandi) : undefined;
  const local = home?.price ?? today;
  const gap = best.price - local;

  if (home && best.mandi !== homeMandi && gap >= 60) {
    // ~₹15/qtl is a rough trolley+fuel cost per extra distance band; keep it honest.
    return `${best.mandi} is ₹${gap}/qtl higher than ${homeMandi}. On a 25 qtl load that is about ₹${gap * 25} more — worth it only if the trip costs less than that.`;
  }
  if (today >= msp) return `At ₹${today}/qtl you are at or above the ₹${msp} MSP — a fair sale close to home.`;
  return `Local rate ₹${today} is below the ₹${msp} MSP; procurement at the centre pays MSP, so booking a slot is the better option.`;
}
