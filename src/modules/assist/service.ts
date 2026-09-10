import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import * as t from "../../db/schema.js";
import type { Lang } from "../../db/schema.js";
import { detectIntent, unknownPrompt, type Intent } from "../../domain/assist.js";
import { farmerQueue } from "../queue/service.js";
import { listPayments } from "../payments/service.js";
import { ratesFor } from "../rates/service.js";

/**
 * Answers a spoken question from the SAME data the screens use — never a separate
 * source that could drift. Returns text ready for text-to-speech; the audio URL is
 * filled by Bhashini when BHASHINI_API_KEY is set (deferred), so text always works.
 */
export interface AssistAnswer {
  intent: Intent;
  answer: string;
  audioUrl: string | null;
}

const say = (pa: string, hi: string, en: string, lang: Lang) => ({ pa, hi, en }[lang]);

export async function ask(userId: string, text: string, lang: Lang): Promise<AssistAnswer> {
  const { intent, crop } = detectIntent(text);

  switch (intent) {
    case "turn": {
      const q = await farmerQueue(userId);
      if (!q) return answer(intent, say(
        "ਤੁਸੀਂ ਇਸ ਵੇਲੇ ਕਿਸੇ ਲਾਈਨ ਵਿੱਚ ਨਹੀਂ ਹੋ.",
        "आप इस समय किसी लाइन में नहीं हैं.",
        "You are not in a queue right now.", lang));
      const { farmersAhead, estimatedWaitMinutes } = q.queue;
      return answer(intent, say(
        `ਤੁਹਾਡੇ ਅੱਗੇ ${farmersAhead} ਗੱਡੀਆਂ ਹਨ, ਲਗਭਗ ${estimatedWaitMinutes} ਮਿੰਟ ਦੀ ਉਡੀਕ.`,
        `आपसे आगे ${farmersAhead} गाड़ियाँ हैं, लगभग ${estimatedWaitMinutes} मिनट का इंतज़ार.`,
        `You have ${farmersAhead} trolleys ahead, about ${estimatedWaitMinutes} minutes to wait.`, lang));
    }
    case "money": {
      const { active, payments } = await listPayments(userId);
      if (!payments.length) return answer(intent, say(
        "ਅਜੇ ਕੋਈ ਭੁਗਤਾਨ ਨਹੀਂ ਹੈ.", "अभी कोई भुगतान नहीं है.", "There are no payments yet.", lang));
      if (active?.status === "failed" || active?.status === "returned") {
        return answer(intent, say(
          `ਤੁਹਾਡਾ ਭੁਗਤਾਨ ਰੁਕਿਆ ਹੈ: ${active.failureReason}`,
          `आपका भुगतान रुका है: ${active.failureReason}`,
          `Your payment is held: ${active.failureReason}`, lang));
      }
      if (active?.status === "initiated") {
        return answer(intent, say(
          `₹${active.amount.toLocaleString("en-IN")} ਬੈਂਕ ਭੇਜਿਆ ਗਿਆ ਹੈ, ਜਲਦੀ ਖਾਤੇ ਵਿੱਚ ਆਵੇਗਾ.`,
          `₹${active.amount.toLocaleString("en-IN")} बैंक भेजा गया है, जल्दी खाते में आएगा.`,
          `₹${active.amount.toLocaleString("en-IN")} has been sent to the bank and will reach your account soon.`, lang));
      }
      const credited = payments.find((p) => p.status === "credited");
      return answer(intent, credited ? say(
        `₹${credited.amount.toLocaleString("en-IN")} ਤੁਹਾਡੇ ਖਾਤੇ ਵਿੱਚ ਜਮ੍ਹਾਂ ਹੋ ਗਿਆ ਹੈ.`,
        `₹${credited.amount.toLocaleString("en-IN")} आपके खाते में जमा हो गया है.`,
        `₹${credited.amount.toLocaleString("en-IN")} has been credited to your account.`, lang)
        : say("ਤੁਹਾਡਾ ਭੁਗਤਾਨ ਤਿਆਰ ਹੋ ਰਿਹਾ ਹੈ.", "आपका भुगतान तैयार हो रहा है.", "Your payment is being prepared.", lang));
    }
    case "rate": {
      const [holding] = await db.select().from(t.holdings).where(eq(t.holdings.userId, userId)).limit(1);
      const view = await ratesFor(crop ?? holding?.crop ?? "Wheat");
      return answer(intent, say(
        `${view.crop} ਦਾ ਅੱਜ ਦਾ ਭਾਅ ₹${view.today} ਪ੍ਰਤੀ ਕੁਇੰਟਲ ਹੈ. ${view.advice}`,
        `${view.crop} का आज का भाव ₹${view.today} प्रति क्विंटल है. ${view.advice}`,
        `Today's ${view.crop} rate is ₹${view.today} per quintal. ${view.advice}`, lang));
    }
    default:
      return answer("unknown", unknownPrompt(lang));
  }
}

function answer(intent: Intent, text: string): AssistAnswer {
  // audioUrl stays null until Bhashini TTS is wired (BHASHINI_API_KEY); the app
  // can fall back to the device's own speech synthesis in the meantime.
  return { intent, answer: text, audioUrl: null };
}
