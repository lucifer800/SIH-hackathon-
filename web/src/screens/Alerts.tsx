import { useState } from "react";
import { api } from "../api";
import { useI18n } from "../i18n/context";
import { fmtRelative } from "../i18n/format";
import { categoryLabel, scriptFont, scriptLocale } from "../i18n/content";
import { useQuery } from "../hooks/useQuery";
import { StatusBar, ScreenBody, TabBar, useToast } from "../ui";

export function Alerts() {
  const { t, lang, font } = useI18n();
  const toast = useToast();
  const { data: items, loading, error, refetch } = useQuery(() => api.notifications(), []);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const resolved = (items ?? []).map((n) => readIds.has(n.id) ? { ...n, read: true } : n);

  async function markRead(id: string) {
    await api.markRead(id);
    setReadIds((s) => new Set(s).add(id));
  }
  function readAloud() {
    toast(t("readToMe"));
    const first = resolved[0];
    if (first && "speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(first.body[lang]);
      u.lang = scriptLocale(first.body[lang]);
      window.speechSynthesis.speak(u);
    }
  }

  return (
    <>
      <StatusBar right={t("alerts")} />
      <ScreenBody style={{ display: "flex", flexDirection: "column" }}>
        <div className="fade-in" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <h2 className="h-display" style={{ margin: "6px 0 6px", fontSize: 31 }}>{t("alerts")}</h2>
          <p style={{ margin: "0 0 18px", fontSize: 14.5, fontWeight: 700, color: "var(--muted)", fontFamily: font }}>
            {t("alertsSaved")}
          </p>

          {error ? (
            <ErrorCard message={t("errorRetry")} onRetry={refetch} retryLabel={t("retry")} />
          ) : loading ? (
            <SkeletonList count={3} height={80} />
          ) : resolved.length === 0 ? (
            <EmptyCard message={t("noAlerts")} font={font} />
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {resolved.map((n) => {
                const dark = !n.read;
                return (
                  <button key={n.id} type="button" onClick={() => markRead(n.id)}
                    style={{ textAlign: "left", padding: "18px 20px", borderRadius: 26, background: dark ? "var(--green-ink)" : "#fff", color: dark ? "var(--on-dark)" : "var(--green-ink)", boxShadow: dark ? "none" : "0 8px 20px rgba(30,59,35,.06)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".08em", color: dark ? "var(--marigold)" : "var(--muted-2)", fontFamily: scriptFont(categoryLabel(n.category, t)) }}>{categoryLabel(n.category, t)}</span>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: dark ? "var(--on-dark-3)" : "var(--muted-2)", fontFamily: font }}>{fmtRelative(n.createdAt, lang)} · {n.channel}</span>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 15.5, fontWeight: 700, lineHeight: 1.5, fontFamily: scriptFont(n.body[lang]) }}>
                      {n.body[lang]}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <button type="button" onClick={readAloud} style={{ marginTop: "auto", minHeight: 64, border: "2.5px solid var(--leaf)", borderRadius: 999, background: "transparent", color: "var(--leaf-text)", fontSize: 16, fontWeight: 800, fontFamily: font }}>
            {t("readToMe")}
          </button>
        </div>
      </ScreenBody>
      <TabBar unread={resolved.filter((n) => !n.read).length} />
    </>
  );
}

function SkeletonList({ count, height }: { count: number; height: number }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ height, borderRadius: 26, background: "rgba(30,59,35,.06)", animation: "sk-pulse 1.5s ease-in-out infinite" }} />
      ))}
    </div>
  );
}

function ErrorCard({ message, onRetry, retryLabel }: { message: string; onRetry: () => void; retryLabel: string }) {
  return (
    <div style={{ margin: "auto 0", padding: "26px 22px", borderRadius: 26, background: "rgba(194,82,31,.08)", textAlign: "center" }}>
      <div style={{ fontSize: 15.5, fontWeight: 700, color: "var(--terra)" }}>{message}</div>
      <button type="button" onClick={onRetry} style={{ marginTop: 14, padding: "10px 24px", borderRadius: 999, background: "var(--terra)", color: "#fff", fontSize: 14, fontWeight: 800 }}>{retryLabel}</button>
    </div>
  );
}

function EmptyCard({ message, font }: { message: string; font: string }) {
  return (
    <div style={{ margin: "auto 0", padding: "26px 22px", borderRadius: 26, background: "var(--amber-soft)", fontSize: 15.5, fontWeight: 700, lineHeight: 1.55, color: "var(--amber-text-2)", fontFamily: font, textAlign: "center" }}>
      {message}
    </div>
  );
}
