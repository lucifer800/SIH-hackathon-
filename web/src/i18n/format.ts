/** Localized date + relative-time formatting. Numerals stay Latin (farmers read
 *  prices and times that way); only the words — month, "hours ago" — translate. */
import { localeOf, type Lang } from "./strings";

/**
 * "2 hours ago" in the selected language. Formatted by hand, not via
 * Intl.RelativeTimeFormat: the runtime ships no Punjabi (pa) relative-time data
 * and falls back to a broken "-2 h", so a small table is the reliable path.
 */
const AGO: Record<Lang, { now: string; min: (n: number) => string; hr: (n: number) => string; day: (n: number) => string }> = {
  pa: { now: "ਹੁਣੇ", min: (n) => `${n} ਮਿੰਟ ਪਹਿਲਾਂ`, hr: (n) => `${n} ਘੰਟੇ ਪਹਿਲਾਂ`, day: (n) => (n === 1 ? "ਕੱਲ੍ਹ" : `${n} ਦਿਨ ਪਹਿਲਾਂ`) },
  hi: { now: "अभी", min: (n) => `${n} मिनट पहले`, hr: (n) => `${n} घंटे पहले`, day: (n) => (n === 1 ? "कल" : `${n} दिन पहले`) },
  en: { now: "just now", min: (n) => `${n} min ago`, hr: (n) => `${n} h ago`, day: (n) => (n === 1 ? "yesterday" : `${n} days ago`) },
};

export function fmtRelative(iso: string, lang: Lang): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const sec = Math.max(0, Math.round((Date.now() - then) / 1000)); // past only; clamp future to "now"
  const w = AGO[lang];
  if (sec < 60) return w.now;
  if (sec < 3600) return w.min(Math.round(sec / 60));
  if (sec < 86400) return w.hr(Math.round(sec / 3600));
  if (sec < 604800) return w.day(Math.round(sec / 86400));
  return fmtDate(iso, lang);
}

/** Localized calendar date, e.g. "20 Aug" / "20 ਅਗਸਤ" / "20 अग॰". */
export function fmtDate(iso: string, lang: Lang, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return iso;
  return new Intl.DateTimeFormat(localeOf(lang), opts).format(d);
}
