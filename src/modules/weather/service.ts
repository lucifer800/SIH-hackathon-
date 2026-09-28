import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import * as t from "../../db/schema.js";
import { declareEvent } from "../disruption/service.js";
import { istDate } from "../../domain/capacity.js";

/** mm of rain in the last hour that's enough to disrupt an open-air procurement yard. */
const RAIN_MM_THRESHOLD = 2;

interface OpenMeteoResponse {
  current?: { precipitation?: number; rain?: number };
}

/** Open-Meteo — free, no API key, no signup. Exactly the seam a demo needs. */
export async function currentRainMm(lat: number, lng: number): Promise<number> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=precipitation,rain&timezone=Asia%2FKolkata`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo fetch failed: ${res.status}`);
  const json = (await res.json()) as OpenMeteoResponse;
  return Number(json.current?.precipitation ?? json.current?.rain ?? 0);
}

/**
 * Checks live rain at every centre open today; the first time a centre crosses
 * the threshold it auto-declares a `rain` centre_event through the exact same
 * declareEvent() an operator's manual entry calls — same reschedule offers,
 * same 6-hour first refusal, same reserve absorption. No new mechanism, just
 * a second way to trigger the one that already exists, so a downpour pauses
 * the day before an operator even looks outside.
 */
export async function checkWeatherDisruptions(): Promise<{ checked: number; triggered: number }> {
  const today = istDate();

  const openCentresToday = await db
    .select({ centreId: t.centreDays.centreId, lat: t.centres.lat, lng: t.centres.lng, name: t.centres.name })
    .from(t.centreDays)
    .innerJoin(t.centres, eq(t.centres.id, t.centreDays.centreId))
    .where(and(eq(t.centreDays.date, today), eq(t.centreDays.status, "open")));

  let triggered = 0;
  for (const c of openCentresToday) {
    let mm: number;
    try {
      mm = await currentRainMm(Number(c.lat), Number(c.lng));
    } catch (err) {
      console.error(`[weather] fetch failed for ${c.name}:`, (err as Error).message);
      continue;
    }
    if (mm < RAIN_MM_THRESHOLD) continue;

    // Already declared today — don't re-trigger a second round of reschedule offers.
    const [already] = await db.select().from(t.centreEvents)
      .where(and(eq(t.centreEvents.centreId, c.centreId), eq(t.centreEvents.date, today), eq(t.centreEvents.kind, "rain")))
      .limit(1);
    if (already) continue;

    await declareEvent({
      operatorId: null,
      centreId: c.centreId,
      date: today,
      kind: "rain",
      note: `Auto-detected: ${mm}mm/h rain at ${c.name} (Open-Meteo)`,
    });
    triggered++;
  }

  return { checked: openCentresToday.length, triggered };
}
