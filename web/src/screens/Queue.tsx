import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Queue as Q } from "../api";
import { useI18n } from "../i18n/context";
import { StatusBar, ScreenBody, TabBar, useToast } from "../ui";

/**
 * The signature screen. The tractor lane is one cell per vehicle in the day's
 * queue: served ones settle amber, the one at the counter pulses green, and the
 * farmer's own cell stands taller with a terracotta border and a "YOU" tag.
 *
 * In the prototype this advanced on a timer. Here it polls advanceQueue() — the
 * exact seam where the real build swaps in GET /queue/stream (SSE).
 */
export function Queue() {
  const { t, font } = useI18n();
  const nav = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState<Q | null>(null);
  const [loaded, setLoaded] = useState(false);
  const timer = useRef<number>();

  useEffect(() => {
    api.dashboard("en").then((d) => { setQ(d.queue); setLoaded(true); });
    // ambient live movement — stands in for the SSE push
    timer.current = window.setInterval(async () => {
      const next = await api.advanceQueue();
      if (next) setQ({ ...next });
    }, 4200);
    return () => window.clearInterval(timer.current);
  }, []);

  async function refresh() {
    const next = await api.advanceQueue();
    if (next) { setQ({ ...next }); toast(t("clearedCounter")); }
  }
  async function ring() {
    await api.notifyWhenNear();
    toast(t("ringHint"));
  }

  if (!q) return (
    <>
      <StatusBar right={t("liveQueue")} />
      <ScreenBody style={{ display: "flex", flexDirection: "column" }}>
        <h2 className="h-display" style={{ margin: "6px 0 16px", fontSize: 31 }}>{t("liveQueue")}</h2>
        {loaded ? (
          <div style={{ margin: "auto 0", padding: "26px 22px", borderRadius: 26, background: "var(--amber-soft)", fontSize: 15.5, fontWeight: 700, lineHeight: 1.55, color: "var(--amber-text-2)", fontFamily: font, textAlign: "center" }}>
            {t("notInQueue")}
          </div>
        ) : (
          <div style={{ height: 200 }} />
        )}
      </ScreenBody>
      <TabBar />
    </>
  );

  const total = q.queueSize;
  const served = q.nowServing;
  const mySeq = q.seq;

  return (
    <>
      <StatusBar right="LIVE" />
      <ScreenBody style={{ display: "flex", flexDirection: "column" }}>
        <div className="fade-in" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div className="eyebrow" style={{ marginTop: 6, fontFamily: font }}>Jagraon · {t("counter")} 7</div>
          <div className="h-display" style={{ marginTop: 10, fontSize: 38, lineHeight: 1.05, fontFamily: font }}>
            <span style={{ color: "var(--terra)", fontFamily: "var(--font-display)" }}>{q.farmersAhead}</span> {t("tractorsAhead")}
          </div>
          <div style={{ marginTop: 8, fontSize: 16, fontWeight: 700, color: "var(--muted)", fontFamily: font }}>
            {t("estWait")} {q.estimatedWaitMinutes} {t("minutes")} · {t("youAreHere")} #{String(mySeq).padStart(3, "0")}
          </div>

          <Lane total={total} served={served} mySeq={mySeq} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 20 }}>
            <div style={{ padding: 18, borderRadius: 26, background: "var(--green-ink)", color: "var(--on-dark)" }}>
              <div className="eyebrow" style={{ color: "var(--marigold)" }}>{t("atCounter")}</div>
              <div className="h-display" style={{ marginTop: 8, fontWeight: 700, fontSize: 28 }}>#{String(served).padStart(3, "0")}</div>
            </div>
            <div className="card" style={{ padding: 18 }}>
              <div className="eyebrow">{t("movingEvery")}</div>
              <div className="h-display" style={{ marginTop: 8, fontWeight: 700, fontSize: 28 }}>2 min</div>
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

function Lane({ total, served, mySeq }: { total: number; served: number; mySeq: number }) {
  // Cap the number of rendered cells so a big queue still fits the phone width.
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
            {mine ? <span style={{ position: "absolute", top: -24, left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap", fontSize: 12, fontWeight: 800, color: "var(--terra)" }}>YOU</span> : null}
          </div>
        );
      })}
    </div>
  );
}
