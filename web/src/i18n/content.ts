/**
 * Content-formatting layer — one place that turns backend data into localized
 * display strings. No screen should hardcode text or build labels inline.
 */
import type { Procurement } from "../api/types";
import type { Lang, L10n } from "./strings";
import { fmtDate } from "./format";

/** Resolve a notification category: mock codes go through t(), backend labels pass through. */
export function categoryLabel(category: string, t: (k: string) => string): string {
  const r = t("cat" + category);
  return r === "cat" + category ? category : r;
}

/** Payment status badge config. */
export function paymentBadge(status: Procurement["paymentStatus"], t: (k: string) => string) {
  const map = {
    credited: { bg: "rgba(87,120,63,.16)", fg: "var(--leaf)", label: t("creditedOn") },
    processing: { bg: "var(--amber-soft)", fg: "var(--amber-text)", label: t("processing") },
    failed: { bg: "rgba(194,82,31,.14)", fg: "var(--terra)", label: t("failed") },
  } as const;
  return map[status] ?? map.processing;
}

/** Payment status line (e.g. "Credited 20 Aug" / "Held — action needed"). */
export function paymentLabel(p: Procurement, lang: Lang, t: (k: string) => string): string {
  const on = p.paymentDate ? " " + fmtDate(p.paymentDate, lang) : "";
  if (p.paymentStatus === "failed") return t("heldAction");
  if (p.paymentStatus === "credited") return t("creditedOn") + on;
  return t("expectedOn") + on;
}

/** Pick the right language from an L10n object, with font detection for script-aware rendering. */
export function pickL10n(l10n: L10n, lang: Lang): string {
  return l10n[lang] ?? l10n.en ?? "";
}

/** Detect the font family from the script of a string (Gurmukhi / Devanagari / Latin). */
export function scriptFont(s: string): string {
  if (/[਀-੿]/.test(s)) return "var(--font-pa)";
  if (/[ऀ-ॿ]/.test(s)) return "var(--font-hi)";
  return "var(--font-ui)";
}

/** Detect the BCP 47 locale from the script of a string. */
export function scriptLocale(s: string): string {
  if (/[਀-੿]/.test(s)) return "pa-IN";
  if (/[ऀ-ॿ]/.test(s)) return "hi-IN";
  return "en-IN";
}
