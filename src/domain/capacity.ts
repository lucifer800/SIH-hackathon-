/**
 * Pure capacity maths. No I/O — this is the part that gets unit-tested and
 * the part a judge will ask about.
 *
 * From the SIH deck:
 *   capacity = min(weighbridge, gunny bags × qtl per bag, godown free space)
 */

export const IST_OFFSET = "+05:30";

export interface CapacityInputs {
  weighbridgeQtlDay: number;
  gunnyBags: number;
  qtlPerBag: number;
  godownFreeQtl: number;
}

export interface CapacityBreakdown {
  capacityQtl: number;
  /** Which input is the binding constraint today — the operator needs to know. */
  bindingConstraint: "weighbridge" | "gunny_bags" | "godown";
  parts: { weighbridge: number; gunnyBags: number; godown: number };
}

export function computeCapacity(c: CapacityInputs): CapacityBreakdown {
  const parts = {
    weighbridge: Math.floor(c.weighbridgeQtlDay),
    gunnyBags: Math.floor(c.gunnyBags * c.qtlPerBag),
    godown: Math.floor(c.godownFreeQtl),
  };
  const capacityQtl = Math.min(parts.weighbridge, parts.gunnyBags, parts.godown);
  const bindingConstraint =
    capacityQtl === parts.weighbridge
      ? "weighbridge"
      : capacityQtl === parts.gunnyBags
        ? "gunny_bags"
        : "godown";
  return { capacityQtl, bindingConstraint, parts };
}

/** Average load per trolley, used to convert a quintal capacity into trolley slots. */
export const QTL_PER_TROLLEY = 25;

export function trolleysFor(capacityQtl: number): number {
  return Math.max(1, Math.floor(capacityQtl / QTL_PER_TROLLEY));
}

/** Two-hour windows, 08:00–18:00 IST. Five per day. */
export const SLOT_WINDOWS = [
  ["08:00", "10:00"],
  ["10:00", "12:00"],
  ["12:00", "14:00"],
  ["14:00", "16:00"],
  ["16:00", "18:00"],
] as const;

export interface PlannedSlot {
  windowStart: Date;
  windowEnd: Date;
  capacityTrolleys: number;
  capacityQtl: number;
}

/**
 * Splits a day's capacity across the windows. Remainder goes to the earliest
 * windows — farmers prefer to be done before the afternoon heat, and an
 * unfilled evening window is cheaper than an overfull morning one.
 */
export function planDay(date: string, capacityQtl: number): PlannedSlot[] {
  const totalTrolleys = trolleysFor(capacityQtl);
  const n = SLOT_WINDOWS.length;
  const base = Math.floor(totalTrolleys / n);
  const remainder = totalTrolleys % n;

  return SLOT_WINDOWS.map(([start, end], i) => {
    const trolleys = base + (i < remainder ? 1 : 0);
    return {
      windowStart: new Date(`${date}T${start}:00${IST_OFFSET}`),
      windowEnd: new Date(`${date}T${end}:00${IST_OFFSET}`),
      capacityTrolleys: trolleys,
      capacityQtl: trolleys * QTL_PER_TROLLEY,
    };
  });
}

/** Today in IST as YYYY-MM-DD, regardless of where the server runs. */
export function istDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00${IST_OFFSET}`);
  d.setUTCDate(d.getUTCDate() + days);
  return istDate(d);
}
