/**
 * Voice-assist intent detection — pure and trilingual.
 *
 * The deck makes voice a first-class path, not a novelty: it must answer three
 * questions without the farmer reading the screen — "when is my turn", "where is
 * my money", "what is the wheat rate". This maps free text (Punjabi, Hindi or
 * English, however the speech-to-text renders it) to one of those intents.
 */
import type { Lang } from "../db/schema.js";

export type Intent = "turn" | "money" | "rate" | "unknown";

interface IntentSpec {
  intent: Exclude<Intent, "unknown">;
  keywords: string[];
}

// Keywords in Gurmukhi, Devanagari and Latin. Matching is substring, lower-cased.
const SPECS: IntentSpec[] = [
  {
    intent: "turn",
    keywords: [
      "ਵਾਰੀ", "ਲਾਈਨ", "ਨੰਬਰ", "ਕਦੋਂ", "ਕਿੰਨੀ ਦੇਰ",           // pa
      "वारी", "बारी", "लाइन", "नंबर", "कब", "कितनी देर",        // hi
      "turn", "queue", "line", "number", "how long", "when", "wait",
    ],
  },
  {
    intent: "money",
    keywords: [
      "ਪੈਸੇ", "ਭੁਗਤਾਨ", "ਖਾਤਾ", "ਭੁਗਤਾਨ", "ਪੈਸਾ",              // pa
      "पैसे", "पैसा", "भुगतान", "खाता", "पेमेंट",                // hi
      "money", "payment", "paid", "account", "credited", "rupees", "amount",
    ],
  },
  {
    intent: "rate",
    keywords: [
      "ਭਾਅ", "ਰੇਟ", "ਕੀਮਤ", "ਮੰਡੀ",                            // pa
      "भाव", "रेट", "कीमत", "दाम", "मंडी",                       // hi
      "rate", "price", "mandi", "msp", "market",
    ],
  },
];

const CROPS: Record<string, string> = {
  wheat: "Wheat", ਕਣਕ: "Wheat", गेहूं: "Wheat", गेहूँ: "Wheat",
  paddy: "Paddy", rice: "Paddy", ਝੋਨਾ: "Paddy", धान: "Paddy",
  maize: "Maize", corn: "Maize", ਮੱਕੀ: "Maize", मक्का: "Maize",
};

export interface Detected {
  intent: Intent;
  crop?: string;   // for rate questions, if a crop was named
}

export function detectIntent(text: string): Detected {
  const q = (text ?? "").toLowerCase();
  if (!q.trim()) return { intent: "unknown" };

  // Score each intent by how many of its keywords appear.
  let best: { intent: Exclude<Intent, "unknown">; score: number } | null = null;
  for (const spec of SPECS) {
    const score = spec.keywords.reduce((n, k) => (q.includes(k.toLowerCase()) ? n + 1 : n), 0);
    if (score > 0 && (!best || score > best.score)) best = { intent: spec.intent, score };
  }
  if (!best) return { intent: "unknown" };

  const crop = Object.entries(CROPS).find(([k]) => q.includes(k))?.[1];
  return crop ? { intent: best.intent, crop } : { intent: best.intent };
}

/** The clarifying prompt when nothing matched, in the farmer's language. */
export function unknownPrompt(lang: Lang): string {
  return {
    pa: "ਮੈਂ ਤੁਹਾਡੀ ਵਾਰੀ, ਤੁਹਾਡੇ ਪੈਸੇ ਜਾਂ ਅੱਜ ਦੇ ਭਾਅ ਬਾਰੇ ਦੱਸ ਸਕਦਾ ਹਾਂ. ਕੀ ਪੁੱਛਣਾ ਹੈ?",
    hi: "मैं आपकी बारी, आपके पैसे या आज के भाव के बारे में बता सकता हूँ. क्या पूछना है?",
    en: "I can tell you your turn, your payment, or today's rate. What would you like?",
  }[lang];
}
