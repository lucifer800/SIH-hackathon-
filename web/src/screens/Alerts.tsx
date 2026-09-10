import { useEffect, useState } from "react";
import { api, type Notification } from "../api";
import { useI18n } from "../i18n/context";
import { StatusBar, ScreenBody, TabBar, useToast } from "../ui";

export function Alerts() {
  const { t } = useI18n();
  const toast = useToast();
  const [items, setItems] = useState<Notification[]>([]);

  useEffect(() => { api.notifications().then(setItems); }, []);

  async function markRead(id: string) {
    await api.markRead(id);
    setItems((cur) => cur.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }
  function readAloud() {
    toast(t("readToMe"));
    const first = items[0];
    if (first && "speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(first.body);
      u.lang = /[਀-੿]/.test(first.body) ? "pa-IN" : /[ऀ-ॿ]/.test(first.body) ? "hi-IN" : "en-IN";
      window.speechSynthesis.speak(u);
    }
  }

  return (
    <>
      <StatusBar right="ALERTS" />
      <ScreenBody style={{ display: "flex", flexDirection: "column" }}>
        <div className="fade-in" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <h2 className="h-display" style={{ margin: "6px 0 6px", fontSize: 31 }}>{t("alerts")}</h2>
          <p style={{ margin: "0 0 18px", fontSize: 14.5, fontWeight: 700, color: "var(--muted)" }}>
            Every SMS we sent is saved here — nothing is lost.
          </p>

          <div style={{ display: "grid", gap: 12 }}>
            {items.map((n) => {
              const dark = !n.read;
              return (
                <button key={n.id} type="button" onClick={() => markRead(n.id)}
                  style={{ textAlign: "left", padding: "18px 20px", borderRadius: 26, background: dark ? "var(--green-ink)" : "#fff", color: dark ? "var(--on-dark)" : "var(--green-ink)", boxShadow: dark ? "none" : "0 8px 20px rgba(30,59,35,.06)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".08em", color: dark ? "var(--marigold)" : "var(--muted-2)" }}>{n.category}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: dark ? "var(--on-dark-3)" : "var(--muted-2)" }}>{n.createdLabel}</span>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 15.5, fontWeight: 700, lineHeight: 1.5, fontFamily: /[਀-੿]/.test(n.body) ? "var(--font-pa)" : /[ऀ-ॿ]/.test(n.body) ? "var(--font-hi)" : "var(--font-ui)" }}>
                    {n.body}
                  </div>
                </button>
              );
            })}
          </div>

          <button type="button" onClick={readAloud} style={{ marginTop: "auto", minHeight: 64, border: "2.5px solid var(--leaf)", borderRadius: 999, background: "transparent", color: "var(--leaf-text)", fontSize: 16, fontWeight: 800 }}>
            🔊 {t("readToMe")}
          </button>
        </div>
      </ScreenBody>
      <TabBar unread={items.filter((n) => !n.read).length} />
    </>
  );
}
