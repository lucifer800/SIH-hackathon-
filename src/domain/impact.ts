/**
 * The four numbers slide 5 promises. They are claims, so the backend measures
 * them rather than asserting them — a district officer (or a judge) can ask the
 * system whether it actually did what the pitch said.
 *
 *   wait at the centre          2–5 days  →  under 90 min
 *   peak-to-average arrivals    3.8×      →  1.3×
 *   payment failure surfaced    silent    →  within 24 h (48 h is the DBT promise)
 *   farmers who know their turn 0%        →  100%
 */

export const IMPACT_TARGETS = {
  medianWaitMinutes: 90,
  peakToAverage: 1.3,
  failureSurfacedHours: 24,
  dbtPromiseHours: 48,
} as const;

export function medianWaitMinutes(waits: number[]): number | null {
  if (!waits.length) return null;
  const sorted = [...waits].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/**
 * Peak-to-average arrival ratio. Without slots everyone shows up at dawn and this
 * runs near 4; the whole point of a slot system is to push it toward 1.
 */
export function peakToAverage(arrivalsPerHour: number[]): number | null {
  const active = arrivalsPerHour.filter((n) => n > 0);
  if (!active.length) return null;
  const mean = active.reduce((a, b) => a + b, 0) / active.length;
  if (mean === 0) return null;
  return Number((Math.max(...active) / mean).toFixed(2));
}

export function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 3_600_000;
}

/** Did the farmer learn a payment had failed inside the 24-hour promise? */
export function failureSurfacedInTime(initiatedAt: Date, notifiedAt: Date | null): boolean {
  if (!notifiedAt) return false;
  return hoursBetween(initiatedAt, notifiedAt) <= IMPACT_TARGETS.failureSurfacedHours;
}

/** Share of served tokens whose farmer had an ETA before leaving home. */
export function knewTheirTurnPct(served: number, withEtaBeforeArrival: number): number {
  if (served === 0) return 0;
  return Number(((withEtaBeforeArrival / served) * 100).toFixed(1));
}
