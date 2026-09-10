import crypto from "node:crypto";

/**
 * scrypt, same primitive the prototype used for passwords — kept because it is
 * in Node core. No native build step, which matters when the whole thing has to
 * come up on a teammate's laptop the night before a demo.
 *
 * Used for OTP codes, gate OTPs and refresh tokens. Never store any of those raw.
 */
const KEY_LEN = 64;

export function hashSecret(secret: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = crypto.scryptSync(secret, salt, KEY_LEN).toString("hex");
  return `scrypt$${salt}$${key}`;
}

export function verifySecret(secret: string, stored: string): boolean {
  const [scheme, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "hex");
  const actual = crypto.scryptSync(secret, salt, KEY_LEN);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

/** Zero-padded numeric code, e.g. "4417". */
export function numericCode(digits = 4): string {
  const max = 10 ** digits;
  return String(crypto.randomInt(0, max)).padStart(digits, "0");
}
