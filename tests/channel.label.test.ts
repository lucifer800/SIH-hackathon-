/**
 * Pure-function tests for channelLabel() and the voice language resolution
 * logic (n.language ?? lang → localeOf).
 *
 * These are inlined here (no web/ import) so they run under the existing
 * backend vitest config without needing a separate web/ vitest setup.
 */
import { describe, it, expect } from "vitest";

// --- channelLabel (mirrors web/src/i18n/content.ts) ---
function channelLabel(channel: string, t: (k: string) => string): string {
  const key = "channel" + channel.charAt(0).toUpperCase() + channel.slice(1).toLowerCase();
  const r = t(key);
  return r === key ? channel : r;
}

// --- localeOf (mirrors web/src/i18n/strings.ts) ---
function localeOf(lang: string): string {
  if (lang === "pa") return "pa-IN";
  if (lang === "hi") return "hi-IN";
  return "en-IN";
}

// --- voice language resolution (mirrors Alerts.tsx speak()) ---
function resolveVoiceLocale(messageLang: string | undefined, toggleLang: string): string {
  const targetLang = messageLang ?? toggleLang;
  return localeOf(targetLang);
}

/* ------------------------------------------------------------------ */

describe("channelLabel", () => {
  const strings: Record<string, string> = {
    channelSms: "SMS",
    channelIvr: "IVR ਕਾਲ",
  };
  const t = (k: string) => strings[k] ?? k;

  it("maps known SMS channel to translated label", () => {
    expect(channelLabel("SMS", t)).toBe("SMS");
  });

  it("maps known IVR channel to translated label", () => {
    expect(channelLabel("IVR", t)).toBe("IVR ਕਾਲ");
  });

  it("falls back to raw code for unknown channels", () => {
    expect(channelLabel("WHATSAPP", t)).toBe("WHATSAPP");
    expect(channelLabel("PUSH", t)).toBe("PUSH");
  });

  it("is case-insensitive on the channel code", () => {
    expect(channelLabel("sms", t)).toBe("SMS");
    expect(channelLabel("ivr", t)).toBe("IVR ਕਾਲ");
  });
});

describe("voice language resolution (n.language ?? toggle)", () => {
  it("uses message language when present, ignoring toggle", () => {
    expect(resolveVoiceLocale("hi", "pa")).toBe("hi-IN");
    expect(resolveVoiceLocale("pa", "hi")).toBe("pa-IN");
    expect(resolveVoiceLocale("en", "pa")).toBe("en-IN");
  });

  it("falls back to toggle language when message has no language set", () => {
    expect(resolveVoiceLocale(undefined, "pa")).toBe("pa-IN");
    expect(resolveVoiceLocale(undefined, "hi")).toBe("hi-IN");
    expect(resolveVoiceLocale(undefined, "en")).toBe("en-IN");
  });
});
