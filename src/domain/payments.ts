/**
 * The DBT payment state machine, from the SIH deck (slide 3, step 6):
 *   "DBT initiated → credited / failed + reason"
 *
 * Pure: the transitions and the weighment maths live here, so the money path can
 * be reasoned about and tested without a bank in the loop.
 *
 *   pending → initiated → credited
 *                      ↘ failed(code, reason)
 *                      ↘ returned(bank_reason)
 *   failed → initiated  (a retry, once the farmer fixes the cause)
 */

export type PaymentStatus = "pending" | "initiated" | "credited" | "failed" | "returned";

const TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  pending: ["initiated"],
  initiated: ["credited", "failed", "returned"],
  failed: ["initiated"],       // retry after the farmer fixes KYC etc.
  returned: ["initiated"],     // re-attempt after correcting account details
  credited: [],                // terminal
};

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export class IllegalPaymentTransition extends Error {
  constructor(readonly from: PaymentStatus, readonly to: PaymentStatus) {
    super(`A payment cannot go from ${from} to ${to}.`);
    this.name = "IllegalPaymentTransition";
  }
}

/* ------------------------------------------------------------ weighment */

/** Wheat MSP fallback when no live rate is loaded yet (₹/quintal, from the deck). */
export const WHEAT_MSP = 2625;

export interface WeighInput {
  grossQtl: number;
  tareQtl: number;
  moisturePct: number;
  normPct?: number;      // wheat FAQ norm is 12%
  ratePerQtl: number;
}

export interface Weighment {
  netQtl: number;
  amount: number;
  moistureOverNorm: boolean;
  normPct: number;
}

export class InvalidWeighment extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWeighment";
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeWeighment(w: WeighInput): Weighment {
  const normPct = w.normPct ?? 12;
  if (w.grossQtl <= 0) throw new InvalidWeighment("Gross weight must be positive.");
  if (w.tareQtl < 0) throw new InvalidWeighment("Tare weight cannot be negative.");
  if (w.tareQtl >= w.grossQtl) throw new InvalidWeighment("Tare cannot be more than the gross weight.");
  if (w.ratePerQtl <= 0) throw new InvalidWeighment("Rate must be positive.");
  if (w.moisturePct < 0 || w.moisturePct > 100) throw new InvalidWeighment("Moisture must be a percentage.");

  const netQtl = round2(w.grossQtl - w.tareQtl);
  return {
    netQtl,
    amount: round2(netQtl * w.ratePerQtl),
    moistureOverNorm: w.moisturePct > normPct,
    normPct,
  };
}

/** Hours a payment has been outstanding — the SLA the district dashboard watches. */
export function hoursOutstanding(initiatedAt: Date | null, now = new Date()): number | null {
  if (!initiatedAt) return null;
  return Math.round(((now.getTime() - initiatedAt.getTime()) / 3_600_000) * 10) / 10;
}
