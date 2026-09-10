/**
 * The booking decision, as one pure function.
 *
 * No database, no clock, no I/O — everything it needs is passed in. That is what
 * lets the fairness rules be tested exhaustively, and what lets the transaction
 * in the service layer stay a thin shell around a decision that has already been
 * made. The deck calls the slot engine "server-authoritative, sole writer of
 * bookings"; this is the authority, and the service is the writer.
 */
import {
  eligiblePools, splitPools, bookableQtl, type Pool,
} from "./fairness.js";

export interface SlotState {
  capacityTrolleys: number;
  /** Active bookings across all pools (booked · checked_in · served). */
  bookedTrolleys: number;
  bookedByPool: Record<Pool, number>;
  /** Reserve + small-holder pools have opened to everyone (T-24h, or day is near). */
  released: boolean;
}

export interface FarmerState {
  areaHa: number;
  entitlementQtl: number;
  usedQtl: number;
  /** Holds an unexpired first-refusal claim on this slot (disruption path). */
  hasHold: boolean;
  hoursUntilDay: number;
}

export interface BookingRequest {
  qtl: number;
  trolleys: number;
}

export type RefusalCode =
  | "INVALID_QUANTITY"
  | "ENTITLEMENT_EXCEEDED"
  | "SLOT_FULL";

export type BookingDecision =
  | { ok: true; pool: Pool; remainingAfterTrolleys: number }
  | { ok: false; code: RefusalCode; message: string; details?: Record<string, unknown> };

/** Remaining trolleys in a pool, accounting for the post-release collapse into general. */
export function poolRemaining(slot: SlotState, pool: Pool): number {
  if (slot.released) {
    // Once pools release, all capacity is one pool. Every active booking — whatever
    // pool it was made from — counts against it, so total is always conserved.
    return pool === "general" ? slot.capacityTrolleys - slot.bookedTrolleys : 0;
  }
  const split = splitPools(slot.capacityTrolleys, false);
  const cap = pool === "general" ? split.general : pool === "reserve" ? split.reserve : split.smallHolder;
  return cap - slot.bookedByPool[pool];
}

export function decideBooking(farmer: FarmerState, slot: SlotState, req: BookingRequest): BookingDecision {
  // 1. Quantity is capped by the land record — the answer to "traders posing as growers".
  const cap = bookableQtl(farmer.entitlementQtl, farmer.usedQtl, req.qtl);
  if (req.qtl <= 0 || req.trolleys <= 0) {
    return { ok: false, code: "INVALID_QUANTITY", message: "Enter how much you want to bring." };
  }
  if (!cap.allowed) {
    return {
      ok: false,
      code: "ENTITLEMENT_EXCEEDED",
      message: `You can bring up to ${cap.remaining} more quintals this season.`,
      details: { remainingQtl: cap.remaining, requestedQtl: req.qtl },
    };
  }

  // 2. Is the slot full overall? Cheap check before walking pools.
  if (slot.bookedTrolleys + req.trolleys > slot.capacityTrolleys) {
    return {
      ok: false,
      code: "SLOT_FULL",
      message: "This time slot is full. Please choose another.",
      details: { capacityTrolleys: slot.capacityTrolleys, bookedTrolleys: slot.bookedTrolleys },
    };
  }

  // 3. Walk the farmer's pools, most-protected first, and take the first with room.
  //    A general-only farmer can be refused here even when the reserve has space —
  //    that is the protection working, not a bug.
  const pools = eligiblePools({
    areaHa: farmer.areaHa,
    hoursUntilDay: farmer.hoursUntilDay,
    hasHold: farmer.hasHold,
  });

  for (const pool of pools) {
    const remaining = poolRemaining(slot, pool);
    if (remaining >= req.trolleys) {
      return { ok: true, pool, remainingAfterTrolleys: remaining - req.trolleys };
    }
  }

  return {
    ok: false,
    code: "SLOT_FULL",
    message: "This time slot is full for you. Please choose another.",
    details: { eligiblePools: pools },
  };
}
