/**
 * Indian mobile normalisation.
 *
 * The farmer app sends 10 digits. SMS webhooks send +91XXXXXXXXXX. An assistant
 * at a CSC will type 0XXXXXXXXXX out of habit. All three are one farmer, and if
 * they are not normalised they become three accounts with three entitlements —
 * which is exactly the duplicate-registration fraud the land-record cap exists
 * to stop.
 *
 * Scope is deliberately +91 only. Procurement centres serve Indian farmers; a
 * general-purpose phone library would add a dependency and hide the one rule
 * that actually matters here (mobile numbers start 6-9).
 */

export class InvalidMobileError extends Error {
  constructor(readonly input: string) {
    super("Enter a 10-digit Indian mobile number.");
    this.name = "InvalidMobileError";
  }
}

const INDIAN_MOBILE = /^[6-9]\d{9}$/;

/** Returns E.164, e.g. "+919876543210". Throws on anything that is not one. */
export function normaliseMobile(input: string): string {
  const digits = String(input ?? "").replace(/\D/g, "");

  let local = digits;
  if (local.length === 12 && local.startsWith("91")) local = local.slice(2);
  else if (local.length === 11 && local.startsWith("0")) local = local.slice(1);
  else if (local.length === 13 && local.startsWith("091")) local = local.slice(3);

  if (!INDIAN_MOBILE.test(local)) throw new InvalidMobileError(input);
  return `+91${local}`;
}

export function isValidMobile(input: string): boolean {
  try {
    normaliseMobile(input);
    return true;
  } catch {
    return false;
  }
}

/** "+919876543210" → "98765 43210", how it is read back on screen. */
export function formatMobile(e164: string): string {
  const local = e164.replace(/^\+91/, "");
  return `${local.slice(0, 5)} ${local.slice(5)}`;
}

/** "+919876543210" → "•••••43210", for logs and shared screens. */
export function maskMobile(e164: string): string {
  const local = e164.replace(/^\+91/, "");
  return `•••••${local.slice(-5)}`;
}
