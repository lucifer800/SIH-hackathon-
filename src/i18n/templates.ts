/**
 * Every message the system can send, in all three languages.
 *
 * These are written as DLT templates from the start — fixed text with named
 * variable slots — because Indian A2P SMS requires each body to be registered
 * in advance and approved unchanged. Writing them "properly later" would mean
 * re-registering, which is weeks, not hours.
 *
 * Three of these are transcribed from the SIH deck (slide 3) and should not be
 * reworded without a reason: they were written for a farmer reading a 2-inch
 * screen in sunlight.
 */
import type { Lang } from "../db/schema.js";

export type TemplateId =
  | "otp_login"
  | "booking_confirmed"
  | "queue_five_away"
  | "payment_failed"
  | "payment_credited"
  | "reschedule_offer"
  | "welcome";

export interface TemplateDef {
  id: TemplateId;
  /** Shown as the heading in the alerts log. */
  category: Record<Lang, string>;
  body: Record<Lang, string>;
  /** Names that must be present in `vars`. Missing one throws at render time. */
  vars: readonly string[];
}

const T = <const>{
  otp_login: {
    id: "otp_login",
    category: { pa: "ਸਾਈਨ ਇਨ", hi: "साइन इन", en: "Sign in" },
    body: {
      pa: "ਕਿਸਾਨਕਿਊ ਕੋਡ {code}. ਕਿਸੇ ਨਾਲ ਸਾਂਝਾ ਨਾ ਕਰੋ.",
      hi: "किसानक्यू कोड {code}. किसी से साझा न करें.",
      en: "KisanQ code {code}. Do not share it with anyone.",
    },
    vars: ["code"],
  },

  /** Deck: पर्ची पक्की — नाभा केंद्र, 14 अप्रैल, 11:00–13:00. गेट OTP 4417. */
  booking_confirmed: {
    id: "booking_confirmed",
    category: { pa: "ਬੁਕਿੰਗ", hi: "बुकिंग", en: "Booking" },
    body: {
      pa: "ਪਰਚੀ ਪੱਕੀ — {centre}, {date}, {window}. ਗੇਟ OTP {gateOtp}.",
      hi: "पर्ची पक्की — {centre}, {date}, {window}. गेट OTP {gateOtp}.",
      en: "Slot confirmed — {centre}, {date}, {window}. Gate OTP {gateOtp}.",
    },
    vars: ["centre", "date", "window", "gateOtp"],
  },

  /** Deck: आपका नंबर 5 गाड़ी बाद. कृपया लेन 3 पर पहुँचें. */
  queue_five_away: {
    id: "queue_five_away",
    category: { pa: "ਲਾਈਨ", hi: "लाइन", en: "Queue" },
    body: {
      pa: "ਤੁਹਾਡੀ ਵਾਰੀ {ahead} ਗੱਡੀਆਂ ਬਾਅਦ. ਕਿਰਪਾ ਕਰਕੇ ਲੇਨ {lane} 'ਤੇ ਪਹੁੰਚੋ.",
      hi: "आपका नंबर {ahead} गाड़ी बाद. कृपया लेन {lane} पर पहुँचें.",
      en: "Your turn is {ahead} trolleys away. Please come to lane {lane}.",
    },
    vars: ["ahead", "lane"],
  },

  /** Deck: भुगतान रुका — खाते से आधार लिंक नहीं. शाखा में KYC कराएँ. */
  payment_failed: {
    id: "payment_failed",
    category: { pa: "ਭੁਗਤਾਨ", hi: "भुगतान", en: "Payment" },
    body: {
      pa: "ਭੁਗਤਾਨ ਰੁਕਿਆ — {reason} ਪਰਚੀ {receiptNo}.",
      hi: "भुगतान रुका — {reason} पर्ची {receiptNo}.",
      en: "Payment held — {reason} Receipt {receiptNo}.",
    },
    vars: ["reason", "receiptNo"],
  },

  payment_credited: {
    id: "payment_credited",
    category: { pa: "ਭੁਗਤਾਨ", hi: "भुगतान", en: "Payment" },
    body: {
      pa: "₹{amount} ਤੁਹਾਡੇ ਖਾਤੇ ਵਿੱਚ ਜਮ੍ਹਾਂ. ਪਰਚੀ {receiptNo}. UTR {utr}.",
      hi: "₹{amount} आपके खाते में जमा. पर्ची {receiptNo}. UTR {utr}.",
      en: "₹{amount} credited to your account. Receipt {receiptNo}. UTR {utr}.",
    },
    vars: ["amount", "receiptNo", "utr"],
  },

  /** Reply-by-digit: the whole flow has to work from a feature phone. */
  reschedule_offer: {
    id: "reschedule_offer",
    category: { pa: "ਸਮਾਂ ਬਦਲਿਆ", hi: "समय बदला", en: "Reschedule" },
    body: {
      pa: "{centre} {reason} ਕਾਰਨ ਬੰਦ. ਨਵਾਂ ਸਮਾਂ {date} {window}. ਮੰਨਜ਼ੂਰ ਲਈ 1 ਭੇਜੋ.",
      hi: "{centre} {reason} के कारण बंद. नया समय {date} {window}. स्वीकार करने के लिए 1 भेजें.",
      en: "{centre} is closed — {reason}. New slot {date} {window}. Reply 1 to accept.",
    },
    vars: ["centre", "reason", "date", "window"],
  },

  welcome: {
    id: "welcome",
    category: { pa: "ਸੁਆਗਤ", hi: "स्वागत", en: "Welcome" },
    body: {
      pa: "ਕਿਸਾਨਕਿਊ ਵਿੱਚ ਸੁਆਗਤ ਹੈ, {name}. ਹੁਣ ਤੁਸੀਂ ਆਪਣੀ ਵਾਰੀ ਬੁਕ ਕਰ ਸਕਦੇ ਹੋ.",
      hi: "किसानक्यू में स्वागत है, {name}. अब आप अपनी बारी बुक कर सकते हैं.",
      en: "Welcome to KisanQ, {name}. You can now book your slot.",
    },
    vars: ["name"],
  },
} satisfies Record<TemplateId, TemplateDef>;

export const TEMPLATES: Record<TemplateId, TemplateDef> = T;

export class MissingTemplateVarError extends Error {
  constructor(templateId: string, missing: string[]) {
    super(`Template ${templateId} is missing: ${missing.join(", ")}`);
    this.name = "MissingTemplateVarError";
  }
}

export interface Rendered {
  templateId: TemplateId;
  language: Lang;
  category: string;
  body: string;
}

/** Renders a template. Throws rather than sending a farmer "Gate OTP {gateOtp}". */
export function render(
  templateId: TemplateId,
  language: Lang,
  vars: Record<string, string | number>,
): Rendered {
  const def = TEMPLATES[templateId];
  const missing = def.vars.filter((v) => vars[v] === undefined || vars[v] === null);
  if (missing.length) throw new MissingTemplateVarError(templateId, missing);

  const body = def.body[language].replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key]));
  return { templateId, language, category: def.category[language], body };
}
