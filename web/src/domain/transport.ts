/** Transport cost calculator's pure math — pulled out of the slider component
 *  so the arithmetic is provable without rendering React. */
export const TRANSPORT_RATE_PER_KM_PER_QTL = 4; // ₹ — standard Punjab tractor-trolley rate

export interface TransportResult {
  costPerQtl: number;
  netPrice: number;
  totalCost: number;
  pctOfMandiPrice: number; // how much of the mandi price the transport cost eats, rounded
}

export function computeTransport(mandiPrice: number, distanceKm: number, trolleyQtl: number): TransportResult {
  const costPerQtl = distanceKm * TRANSPORT_RATE_PER_KM_PER_QTL;
  const netPrice = Math.max(0, mandiPrice - costPerQtl);
  const totalCost = costPerQtl * trolleyQtl;
  const saving = mandiPrice - netPrice;
  const pctOfMandiPrice = mandiPrice > 0 ? Math.round((saving / mandiPrice) * 100) : 0;
  return { costPerQtl, netPrice, totalCost, pctOfMandiPrice };
}
