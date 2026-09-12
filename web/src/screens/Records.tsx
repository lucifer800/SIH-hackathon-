import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Procurement } from "../api";
import { useI18n } from "../i18n/context";
import { fmtDate } from "../i18n/format";
import { StatusBar, ScreenBody, TabBar, money } from "../ui";

export function Records() {
  const { t, lang, font } = useI18n();
  const nav = useNavigate();
  const [items, setItems] = useState<Procurement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  function load() {
    setError(false); setLoading(true);
    api.procurements()
      .then((p) => { setItems(p); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }

  useEffect(() => { load(); }, []);

  const payLabel = (p: Procurement) => {
    const on = p.paymentDate ? " " + fmtDate(p.paymentDate, lang) : "";
    if (p.paymentStatus === "failed") return t("heldAction");
    if (p.paymentStatus === "credited") return t("creditedOn") + on;
    return t("expectedOn") + on;
  };

  function logout() {
    api.logout();
    window.dispatchEvent(new Event("kq-auth"));
    nav("/login", { replace: true });
  }

  const badge: Record<Procurement["paymentStatus"], { bg: string; fg: string; label: string }> = {
    credited: { bg: "rgba(87,120,63,.16)", fg: "var(--leaf)", label: t("creditedOn") },
    processing: { bg: "var(--amber-soft)", fg: "var(--amber-text)", label: t("processing") },
    failed: { bg: "rgba(194,82,31,.14)", fg: "var(--terra)", label: t("failed") },
  };

  return (
    <>
      <StatusBar />
      <ScreenBody style={{ display: "flex", flexDirection: "column" }}>
        <div className="fade-in" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 className="h-display" style={{ margin: "6px 0", fontSize: 28 }}>{t("records")}</h2>
            <button type="button" onClick={logout} style={{ fontSize: 13, fontWeight: 800, color: "var(--terra)" }}>{t("logout")}</button>
          </div>

          {error ? (
            <div style={{ margin: "auto 0", padding: "26px 22px", borderRadius: 26, background: "rgba(194,82,31,.08)", textAlign: "center" }}>
              <div style={{ fontSize: 15.5, fontWeight: 700, color: "var(--terra)" }}>{t("errorRetry")}</div>
              <button type="button" onClick={load} style={{ marginTop: 14, padding: "10px 24px", borderRadius: 999, background: "var(--terra)", color: "#fff", fontSize: 14, fontWeight: 800 }}>{t("retry")}</button>
            </div>
          ) : loading ? (
            <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
              {[0, 1].map((i) => (
                <div key={i} style={{ height: 110, borderRadius: 26, background: "rgba(30,59,35,.06)", animation: "sk-pulse 1.5s ease-in-out infinite" }} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div style={{ margin: "auto 0", padding: "26px 22px", borderRadius: 26, background: "var(--amber-soft)", fontSize: 15.5, fontWeight: 700, lineHeight: 1.55, color: "var(--amber-text-2)", fontFamily: font, textAlign: "center" }}>
              {t("noRecords")}
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
              {items.map((p) => {
                const b = badge[p.paymentStatus];
                return (
                  <div key={p.id} className="card" style={{ padding: 18 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 800 }}>{p.crop} · {p.variety}</div>
                        <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700, color: "var(--muted-2)", fontFamily: font }}>{fmtDate(p.date, lang, { day: "numeric", month: "short", year: "numeric" })} · {p.quantityQuintals} {t("qtlUnit")}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className="h-display" style={{ fontSize: 22 }}>{money.format(p.amount)}</div>
                        <span style={{ display: "inline-block", marginTop: 6, padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 800, background: b.bg, color: b.fg }}>{b.label}</span>
                      </div>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 700, color: "var(--muted-2)", fontFamily: font }}>{payLabel(p)}</div>
                    {p.failureReason ? (
                      <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 16, background: "rgba(194,82,31,.08)", border: "1.5px solid rgba(194,82,31,.2)", fontSize: 13.5, fontWeight: 700, lineHeight: 1.5, color: "var(--terra-hover)", fontFamily: font }}>
                        {p.failureReason[lang]}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          <FairnessCard />
        </div>
      </ScreenBody>
      <TabBar />
    </>
  );
}

function FairnessCard() {
  const { t, font } = useI18n();
  const rules = [t("fair1"), t("fair2"), t("fair3"), t("fair4"), t("fair5")];
  return (
    <div style={{ marginTop: 18, padding: "18px 20px", borderRadius: 26, background: "var(--field)" }}>
      <div className="eyebrow" style={{ color: "var(--muted-3)" }}>{t("fairRules")}</div>
      <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
        {rules.map((r, i) => (
          <li key={i} style={{ display: "grid", gridTemplateColumns: "18px 1fr", gap: 10, fontSize: 13.5, fontWeight: 700, lineHeight: 1.45, color: "var(--muted-3)", fontFamily: font }}>
            <span style={{ color: "var(--leaf)" }}>✓</span>{r}
          </li>
        ))}
      </ul>
    </div>
  );
}
