/**
 * Bank return codes → a reason the farmer can act on, in their language.
 *
 * The deck's promise (slide 5): payment failure "surfaced within 24 h" with "the
 * exact fix" — not "technical reasons", the phrase a real farmer in Yadadri
 * Bhongir was fobbed off with. Each code names what to do, not just what broke.
 */
import type { Lang } from "../db/schema.js";

export interface BankReason {
  code: string;
  status: "failed" | "returned";
  reason: Record<Lang, string>;
}

const REASONS: Record<string, BankReason> = {
  ACCOUNT_NOT_LINKED: {
    code: "ACCOUNT_NOT_LINKED",
    status: "failed",
    reason: {
      pa: "ਖਾਤੇ ਨਾਲ ਆਧਾਰ ਲਿੰਕ ਨਹੀਂ. ਸ਼ਾਖਾ ਵਿੱਚ KYC ਕਰਵਾਓ.",
      hi: "खाते से आधार लिंक नहीं. शाखा में KYC कराएँ.",
      en: "Account not linked to Aadhaar. Complete KYC at your branch.",
    },
  },
  ACCOUNT_FROZEN: {
    code: "ACCOUNT_FROZEN",
    status: "failed",
    reason: {
      pa: "ਖਾਤਾ ਫ੍ਰੀਜ਼ ਹੈ. ਆਪਣੀ ਬੈਂਕ ਸ਼ਾਖਾ ਨਾਲ ਸੰਪਰਕ ਕਰੋ.",
      hi: "खाता फ़्रीज़ है. अपनी बैंक शाखा से संपर्क करें.",
      en: "Account is frozen. Contact your bank branch.",
    },
  },
  WRONG_ACCOUNT: {
    code: "WRONG_ACCOUNT",
    status: "returned",
    reason: {
      pa: "ਖਾਤਾ ਨੰਬਰ ਗਲਤ. ਸਹੀ ਖਾਤਾ ਵੇਰਵੇ ਕੇਂਦਰ ਵਿੱਚ ਦਿਓ.",
      hi: "खाता नंबर गलत. सही खाता विवरण केंद्र में दें.",
      en: "Wrong account number. Give correct account details at the centre.",
    },
  },
  ACCOUNT_CLOSED: {
    code: "ACCOUNT_CLOSED",
    status: "returned",
    reason: {
      pa: "ਖਾਤਾ ਬੰਦ ਹੈ. ਨਵਾਂ ਖਾਤਾ ਵੇਰਵਾ ਦਿਓ.",
      hi: "खाता बंद है. नया खाता विवरण दें.",
      en: "Account is closed. Provide new account details.",
    },
  },
  NAME_MISMATCH: {
    code: "NAME_MISMATCH",
    status: "failed",
    reason: {
      pa: "ਨਾਮ ਮੇਲ ਨਹੀਂ ਖਾਂਦਾ. ਬੈਂਕ ਵਿੱਚ ਨਾਮ ਠੀਕ ਕਰਵਾਓ.",
      hi: "नाम मेल नहीं खाता. बैंक में नाम ठीक कराएँ.",
      en: "Name does not match. Correct the name at your bank.",
    },
  },
};

const UNKNOWN: BankReason = {
  code: "UNKNOWN",
  status: "failed",
  reason: {
    pa: "ਭੁਗਤਾਨ ਰੁਕਿਆ. ਕਿਰਪਾ ਕਰਕੇ ਕੇਂਦਰ ਨਾਲ ਸੰਪਰਕ ਕਰੋ.",
    hi: "भुगतान रुका. कृपया केंद्र से संपर्क करें.",
    en: "Payment held. Please contact the centre.",
  },
};

export function bankReason(code: string): BankReason {
  return REASONS[code?.toUpperCase()] ?? { ...UNKNOWN, code: code || "UNKNOWN" };
}

export const KNOWN_BANK_CODES = Object.keys(REASONS);
