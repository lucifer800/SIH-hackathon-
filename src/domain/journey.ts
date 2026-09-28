/**
 * The produce journey tracker's stage rule — pulled out of the /journey route
 * so it's a plain function over already-fetched rows, not something only
 * provable by hitting the database. Same pattern as capacity.ts / fairness.ts.
 *
 *   1 Booked  2 Arrived  3 Weighed  4 Payment processing  5 Paid
 */
export type JourneyStage = 1 | 2 | 3 | 4 | 5;

export function deriveJourneyStage(input: {
  bookingStatus: string;
  hasLot: boolean;
  paymentStatus: string | null | undefined;
}): JourneyStage {
  if (input.paymentStatus === "credited") return 5;
  if (input.paymentStatus) return 4;
  if (input.hasLot) return 3;
  if (input.bookingStatus === "checked_in") return 2;
  return 1;
}
