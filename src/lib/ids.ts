import crypto from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0, I/1 — these get read aloud

function code(length: number): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

/** KS-26-3F2A9C — spoken over a phone, printed on a slip. */
export const bookingRef = (when = new Date()) =>
  `KS-${String(when.getFullYear()).slice(-2)}-${code(6)}`;

/** RC-260909-4B7K */
export const receiptNo = (when = new Date()) => {
  const d = when.toISOString().slice(2, 10).replace(/-/g, "");
  return `RC-${d}-${code(4)}`;
};

/** A plausible UTR when the bank file omits one (demo/reconciliation fallback). */
export const nanoIdUtr = (when = new Date()) =>
  `UTR${String(when.getFullYear()).slice(-2)}${code(9)}`;

/** GRV-4B7K — a grievance the farmer can quote over the phone. */
export const grievanceRef = () => `GRV-${code(4)}`;
