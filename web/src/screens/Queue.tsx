import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Queue as Q } from "../api";
import { useI18n } from "../i18n/context";
import { fmtNumber } from "../i18n/format";
import { useQuery } from "../hooks/useQuery";
import { StatusBar, ScreenBody, TabBar, useToast } from "../ui";

export function Queue() {
  const { t, lang, font } = useI18n();
  const nav = useNavigate();
  const toast = useToast();
  const { data: dash, loading, error, refetch } = useQuery(() => api.dashboard("en"), []);
  const [q, setQ] = useState<Q | null>(null);

  useEffect(() => {
    if (dash?.queue && !q) setQ(dash.queue);
  }, [dash?.queue, q]);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const next = await api.advanceQueue();
        if (next) setQ(next);
      } catch { /* silent poll failure */ }
    }, 4200);
    return () => window.clearInterval(timer);
  }, []);

  async function refresh() {
    try {
      const next = await api.advanceQueue();
      if (next) { setQ(next); toast(t("clearedCounter")); refetch(); }
    } catch { toast(t("errorRetry")); }
  }
  async function ring() {
    try { await api.notifyWhenNear(); toast(t("ringHint")); }
    catch { toast(t("errorRetry")); }
  }

  if (error) return (
    <>
      <StatusBar right={t("liveQueue")} />
      <ScreenBody style={{ display: "flex", flexDirection: "column" }}>
        <h2 className="h-display" style={{ margin: "6px 0 16px", fontSize: 31 }}>{t("liveQueue")}</h2>
        <div style={{ margin: "auto 0", padding: "26px 22px", borderRadius: 26, background: "rgba(194,82,31,.08)", textAlign: "center" }}>
          <div style={{ fontSize: 15.5, fontWeight: 700, color: "var(--terra)" }}>{t("errorRetry")}</div>
          <button type="button" onClick={refetch} style={{ marginTop: 14, padding: "10px 24px", borderRadius: 999, background: "var(--terra)", color: "#fff", fontSize: 14, fontWeight: 800 }}>{t("retry")}</button>
        </div>
      </ScreenBody>
      <TabBar />
    </>
  );

  if (loading) return (
    <>
      <StatusBar right={t("liveQueue")} />
      <ScreenBody style={{ display: "flex", flexDirection: "column" }}>
        <h2 className="h-display" style={{ margin: "6px 0 16px", fontSize: 31 }}>{t("liveQueue")}</h2>
        <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ height: i === 0 ? 80 : 60, borderRadius: 26, background: "rgba(30,59,35,.06)", animation: "sk-pulse 1.5s ease-in-out infinite" }} />
          ))}
        </div>
      </ScreenBody>
      <TabBar />
    </>
  );

  if (!q) return (
    <>
      <StatusBar right={t("liveQueue")} />
      <ScreenBody style={{ display: "flex", flexDirection: "column" }}>
        <h2 className="h-display" style={{ margin: "6px 0 16px", fontSize: 31 }}>{t("liveQueue")}</h2>
        <div style={{ margin: "auto 0", padding: "26px 22px", borderRadius: 26, background: "var(--amber-soft)", fontSize: 15.5, fontWeight: 700, lineHeight: 1.55, color: "var(--amber-text-2)", fontFamily: font, textAlign: "center" }}>
          {t("notInQueue")}
        </div>
      </ScreenBody>
      <TabBar />
    </>
  );

  const total = q.queueSize;
  const served = q.nowServing;
  const mySeq = q.seq;

  return (
    <>
      <StatusBar right={t("live")} />
      <ScreenBody style={{ display: "flex", flexDirection: "column" }}>
        <div className="fade-in" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div className="eyebrow" style={{ marginTop: 6, fontFamily: font }}>{t("liveQueue")}</div>
          <div className="h-display" style={{ marginTop: 10, fontSize: 38, lineHeight: 1.05, fontFamily: font }}>
            <span style={{ color: "var(--terra)", fontFamily: "var(--font-display)" }}>{fmtNumber(q.farmersAhead, lang)}</span> {t("tractorsAhead")}
          </div>
          <div style={{ marginTop: 8, fontSize: 16, fontWeight: 700, color: "var(--muted)", fontFamily: font }}>
            {t("estWait")} {fmtNumber(q.estimatedWaitMinutes, lang)} {t("minutes")} · {t("youAreHere")} #{fmtNumber(mySeq, lang, { minimumIntegerDigits: 3 })}
          </div>

          <Lane total={total} served={served} mySeq={mySeq} youLabel={t("youAreHere")} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 20 }}>
            <div style={{ padding: 18, borderRadius: 26, background: "var(--green-ink)", color: "var(--on-dark)" }}>
              <div className="eyebrow" style={{ color: "var(--marigold)" }}>{t("atCounter")}</div>
              <div className="h-display" style={{ marginTop: 8, fontWeight: 700, fontSize: 28 }}>#{String(served).padStart(3, "0")}</div>
            </div>
            <div className="card" style={{ padding: 18 }}>
              <div className="eyebrow">{t("movingEvery")}</div>
              <div className="h-display" style={{ marginTop: 8, fontWeight: 700, fontSize: 28 }}>2 {t("minutes")}</div>
            </div>
          </div>

          <div style={{ marginTop: 14, padding: "18px 20px", borderRadius: 26, background: "var(--amber-soft)", fontSize: 14.5, fontWeight: 700, lineHeight: 1.55, color: "var(--amber-text-2)", fontFamily: font }}>
            {t("ringHint")}
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: "auto", paddingTop: 18 }}>
            <button type="button" onClick={ring} style={{ flex: 1, minHeight: 62, borderRadius: 999, background: "var(--green-ink)", color: "var(--on-dark)", fontSize: 16, fontWeight: 800 }}>{t("ringMyPhone")}</button>
            <button type="button" onClick={refresh} style={{ minHeight: 62, border: "2.5px solid var(--line-strong)", borderRadius: 999, padding: "0 22px", background: "transparent", fontSize: 15, fontWeight: 800 }}>{t("refresh")}</button>
          </div>
          <button type="button" onClick={() => nav("/home")} style={{ marginTop: 12, fontSize: 14, fontWeight: 700, color: "var(--muted)" }}>← {t("tabHome")}</button>
        </div>
      </ScreenBody>
      <TabBar />
    </>
  );
}

function Lane({ total, served, mySeq, youLabel }: { total: number; served: number; mySeq: number; youLabel: string }) {
  const cells = Array.from({ length: Math.min(total, 46) }, (_, i) => i + 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, marginTop: 30, paddingTop: 26, paddingBottom: 16, borderBottom: "3px solid var(--line)" }}>
      {cells.map((seq) => {
        const done = seq < served;
        const now = seq === served;
        const mine = seq === mySeq;
        return (
          <div key={seq} style={{
            position: "relative", flex: "1 1 0", minWidth: 0,
            height: mine ? 66 : now ? 56 : 38, borderRadius: 12,
            background: done ? "var(--marigold)" : now ? "var(--leaf)" : mine ? "#fff" : "rgba(30,59,35,.1)",
            border: mine ? "3px solid var(--terra)" : "none",
            animation: now ? "sk-ring 2s ease-out infinite" : "none",
            transition: "background .5s ease, height .3s ease",
          }}>
            {mine ? <span style={{ position: "absolute", top: -24, left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap", fontSize: 12, fontWeight: 800, color: "var(--terra)" }}>{youLabel}</span> : null}
          </div>
        );
      })}
    </div>
  );
}
