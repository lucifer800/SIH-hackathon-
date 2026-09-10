import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { STRINGS, type Lang } from "./strings";

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
  font: string;
}

const Ctx = createContext<I18n | null>(null);
const FONTS: Record<Lang, string> = { pa: "var(--font-pa)", hi: "var(--font-hi)", en: "var(--font-ui)" };

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem("kq-lang") as Lang) || "pa");
  const setLang = useCallback((l: Lang) => {
    localStorage.setItem("kq-lang", l);
    document.documentElement.lang = l;
    setLangState(l);
  }, []);
  const t = useCallback((key: string) => STRINGS[lang][key] ?? STRINGS.en[key] ?? key, [lang]);
  return <Ctx.Provider value={{ lang, setLang, t, font: FONTS[lang] }}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useI18n outside provider");
  return ctx;
}
