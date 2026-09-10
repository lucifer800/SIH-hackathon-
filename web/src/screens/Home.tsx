import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Dashboard } from "../api";
import { useI18n } from "../i18n/context";
import { StatusBar, ScreenBody, TabBar, LangChips, useToast, money } from "../ui";

export function Home() {
  const { t, lang, font } = useI18n();
  const nav = useNavigate();
  const toast = useToast();
  const [d, setD] = useState<Dashboard | null>(null);

  useEffect(() => { api.dashboard(lang).then(setD); }, [lang]);

  async function refresh() {
    const q = await api.advanceQueue();
    if (q) { setD((cur) => (cur ? { ...cur, queue: q } : cur)); toast(t("refresh") + " ✓"); }
  }

  const a = d?.appointment;
  const q = d?.queue;
  const remaining = d ? Math.max(0, d.holding.entitlementQtl - d.holding.usedQtl) : 0;

  return (
    <>
      <StatusBar />
      <ScreenBody>
        {!d ? <Skeleton /> : (
          <div className="fade-in">
            {/* greeting */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontFamily: "var(--font-pa)", fontSize: 15, fontWeight: 700, color: "var(--muted)" }}>{t("greeting")}</div>
                <div className="h-display" style={{ fontSize: 26 }}>{d.user.name.split(" ")[0]} ji</div>
              </div>
              <LangChips compact />
            </div>

            {/* next appointment */}
            {a ? (
              <div style={{ marginTop: 18, padding: 24, borderRadius: 32, background: "var(--green-ink)", color: "var(--on-dark)" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "8px 14px", borderRadius: 999, background: "rgba(255,202,85,.2)", fontSize: 12.5, fontWeight: 800, color: "var(--marigold)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--marigold)" }} />{t("tomorrow")}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 14 }}>
                  <div className="h-display" style={{ fontWeight: 700, fontSize: 66, lineHeight: .9 }}>{a.slot.replace(/ ?[AP]M/, "")}</div>
                  <div className="h-display" style={{ fontSize: 20, color: "var(--on-dark-3)" }}>{a.slot.slice(-2)}</div>
                </div>
                <div style={{ marginTop: 10, fontSize: 15.5, fontWeight: 600, lineHeight: 1.5, color: "var(--on-dark-2)", fontFamily: font }}>
                  {a.centre} · {a.crop} · {a.qtl} qtl
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                  <button type="button" onClick={() => toast(`${t("gateOtp")} ${a.gateOtp} — ${t("showAtGate")}`)} style={{ flex: 1, minHeight: 56, borderRadius: 999, background: "var(--marigold)", color: "var(--amber-text-3)", fontSize: 15, fontWeight: 800 }}>{t("gateOtp")} {a.gateOtp}</button>
                  <button type="button" onClick={() => nav("/queue")} style={{ flex: 1, minHeight: 56, border: "2px solid rgba(255,248,236,.5)", borderRadius: 999, background: "transparent", color: "var(--on-dark)", fontSize: 15, fontWeight: 700 }}>{t("viewQueue")}</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => nav("/book")} style={{ marginTop: 18, width: "100%", padding: 24, borderRadius: 32, background: "var(--green-ink)", color: "var(--on-dark)", textAlign: "left" }}>
                <div className="h-display" style={{ fontSize: 24 }}>{t("noBooking")}</div>
                <div style={{ marginTop: 8, fontSize: 15, fontWeight: 700, color: "var(--marigold)" }}>{t("bookNow")} →</div>
              </button>
            )}

            {/* stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
              <button type="button" onClick={() => nav("/records")} className="card" style={{ padding: 18, textAlign: "left" }}>
                <div className="eyebrow">{t("payment")}</div>
                <div className="h-display" style={{ marginTop: 8, fontWeight: 700, fontSize: 24 }}>{money.format(d.payment?.amount ?? d.procurementValue)}</div>
                <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 700, color: d.payment?.paymentStatus === "failed" ? "var(--terra)" : "var(--leaf)" }}>
                  {d.payment ? d.payment.paymentLabel : t("creditedOn")}
                </div>
              </button>
              <div className="card" style={{ padding: 18 }}>
                <div className="eyebrow">{t("entitlement")}</div>
                <div className="h-display" style={{ marginTop: 8, fontWeight: 700, fontSize: 24 }}>{remaining.toFixed(1)}</div>
                <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 700, color: "var(--muted-2)", fontFamily: font }}>{t("quintalsLeft")}</div>
              </div>
            </div>

            {/* queue strip */}
            {q ? (
              <div style={{ marginTop: 14, padding: "18px 20px", borderRadius: 26, background: "var(--amber-soft)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div>
                    <div className="eyebrow" style={{ color: "var(--amber-text)" }}>{t("liveQueue")}</div>
                    <div className="h-display" style={{ marginTop: 6, fontSize: 22, fontFamily: font }}>{q.farmersAhead} {t("farmersAhead")} · {q.estimatedWaitMinutes} {t("minutes")}</div>
                  </div>
                  <button type="button" onClick={refresh} style={{ minHeight: 48, borderRadius: 999, padding: "0 18px", background: "var(--green-ink)", color: "var(--on-dark)", fontSize: 13.5, fontWeight: 800 }}>{t("refresh")}</button>
                </div>
              </div>
            ) : null}

            {/* voice CTA */}
            <button type="button" onClick={() => nav("/voice")} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, width: "100%", minHeight: 62, marginTop: 14, border: "2.5px solid var(--leaf)", borderRadius: 999, background: "rgba(87,120,63,.1)", color: "var(--leaf-text)", fontSize: 16, fontWeight: 800, fontFamily: font }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: "var(--leaf)", animation: "sk-ring 2s ease-out infinite" }} />
              {t("askByVoice")}
            </button>
          </div>
        )}
      </ScreenBody>
      <TabBar unread={d?.unreadNotifications ?? 0} />
    </>
  );
}

function Skeleton() {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ height: 48 }} />
      <div style={{ height: 180, borderRadius: 32, background: "rgba(30,59,35,.06)" }} />
      <div style={{ height: 90, borderRadius: 26, background: "rgba(30,59,35,.06)" }} />
      <div style={{ height: 62, borderRadius: 999, background: "rgba(30,59,35,.06)" }} />
    </div>
  );
}
