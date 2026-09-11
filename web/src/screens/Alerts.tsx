import { useEffect, useState } from "react";
import { api, type Notification } from "../api";
import { useI18n } from "../i18n/context";
import { fmtRelative } from "../i18n/format";
import { StatusBar, ScreenBody, TabBar, useToast } from "../ui";

// A sent SMS keeps its own language, so pick the font from the text's script,
// not from the UI toggle — a Punjabi alert stays legible while the app is in English.
const scriptFont = (s: string) => (/[਀-੿]/.test(s) ? "var(--font-pa)" : /[ऀ-ॿ]/.test(s) ? "var(--font-hi)" : "var(--font-ui)");
const scriptLocale = (s: string) => (/[਀-੿]/.test(s) ? "pa-IN" : /[ऀ-ॿ]/.test(s) ? "hi-IN" : "en-IN");

export function Alerts() {
  const { t, lang, font } = useI18n();
  const toast = useToast();
  const [items, setItems] = useState<Notification[]>([]);

  useEffect(() => { api.notifications().then(setItems); }, []);

  // Mock categories are codes (t() resolves them); backend categories arrive already localized.
  const catText = (c: string) => { const r = t("cat" + c); return r === "cat" + c ? c : r; };

  async function markRead(id: string) {
    await api.markRead(id);
    setItems((cur) => cur.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }
  function readAloud() {
    toast(t("readToMe"));
    const first = items[0];
    if (first && "speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(first.body[lang]);
      u.lang = scriptLocale(first.body[lang]);
      window.speechSynthesis.speak(u);
    }
  }

  return (
    <>
      <StatusBar right="ALERTS" />
      <ScreenBody style={{ display: "flex", flexDirection: "column" }}>
        <div className="fade-in" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <h2 className="h-display" style={{ margin: "6px 0 6px", fontSize: 31 }}>{t("alerts")}</h2>
          <p style={{ margin: "0 0 18px", fontSize: 14.5, fontWeight: 700, color: "var(--muted)", fontFamily: font }}>
            {t("alertsSaved")}
          </p>

          <div style={{ display: "grid", gap: 12 }}>
            {items.map((n) => {
              const dark = !n.read;
              return (
                <button key={n.id} type="button" onClick={() => markRead(n.id)}
                  style={{ textAlign: "left", padding: "18px 20px", borderRadius: 26, background: dark ? "var(--green-ink)" : "#fff", color: dark ? "var(--on-dark)" : "var(--green-ink)", boxShadow: dark ? "none" : "0 8px 20px rgba(30,59,35,.06)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".08em", color: dark ? "var(--marigold)" : "var(--muted-2)", fontFamily: scriptFont(catText(n.category)) }}>{catText(n.category)}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: dark ? "var(--on-dark-3)" : "var(--muted-2)", fontFamily: font }}>{fmtRelative(n.createdAt, lang)} · {n.channel}</span>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 15.5, fontWeight: 700, lineHeight: 1.5, fontFamily: scriptFont(n.body[lang]) }}>
                    {n.body[lang]}
                  </div>
                </button>
              );
            })}
          </div>

          <button type="button" onClick={readAloud} style={{ marginTop: "auto", minHeight: 64, border: "2.5px solid var(--leaf)", borderRadius: 999, background: "transparent", color: "var(--leaf-text)", fontSize: 16, fontWeight: 800, fontFamily: font }}>
            🔊 {t("readToMe")}
          </button>
        </div>
      </ScreenBody>
      <TabBar unread={items.filter((n) => !n.read).length} />
    </>
  );
}
