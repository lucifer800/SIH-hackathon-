import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Procurement } from "../api";
import { useI18n } from "../i18n/context";
import { StatusBar, ScreenBody, TabBar, money } from "../ui";

/**
 * Records + payment tracker + the published fairness rules. The deck's answer to
 * "payment is a black box" is that every held payment shows the exact reason, in
 * the farmer's language — and the fairness rules are shown, not hidden, because
 * they are served from the same constants the booking engine uses (/public/rules).
 */
export function Records() {
  const { t, font } = useI18n();
  const nav = useNavigate();
  const [items, setItems] = useState<Procurement[]>([]);

  useEffect(() => { api.procurements().then(setItems); }, []);

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

          <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
            {items.map((p) => {
              const b = badge[p.paymentStatus];
              return (
                <div key={p.id} className="card" style={{ padding: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800 }}>{p.crop} · {p.variety}</div>
                      <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700, color: "var(--muted-2)" }}>{p.date} · {p.quantityQuintals} qtl</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="h-display" style={{ fontSize: 22 }}>{money.format(p.amount)}</div>
                      <span style={{ display: "inline-block", marginTop: 6, padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 800, background: b.bg, color: b.fg }}>{b.label}</span>
                    </div>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 700, color: "var(--muted-2)" }}>{p.paymentLabel}</div>
                  {p.failureReason ? (
                    <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 16, background: "rgba(194,82,31,.08)", border: "1.5px solid rgba(194,82,31,.2)", fontSize: 13.5, fontWeight: 700, lineHeight: 1.5, color: "var(--terra-hover)", fontFamily: font }}>
                      ⚠ {p.failureReason}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <FairnessCard />
        </div>
      </ScreenBody>
      <TabBar />
    </>
  );
}

function FairnessCard() {
  const { t } = useI18n();
  const rules = [
    "Order = slot window, then check-in time. Late means the back of your own window, never the back of the day.",
    "Rained-out farmers get a 6-hour first refusal on released slots.",
    "30% of slots held for holdings under 2 ha, until 24 h before.",
    "Quantity is capped by your land record — no more than your entitlement.",
    "Repeated no-shows lower your priority score. Nothing about this is hidden.",
  ];
  return (
    <div style={{ marginTop: 18, padding: "18px 20px", borderRadius: 26, background: "var(--field)" }}>
      <div className="eyebrow" style={{ color: "var(--muted-3)" }}>{t("fairRules")}</div>
      <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
        {rules.map((r, i) => (
          <li key={i} style={{ display: "grid", gridTemplateColumns: "18px 1fr", gap: 10, fontSize: 13.5, fontWeight: 700, lineHeight: 1.45, color: "var(--muted-3)" }}>
            <span style={{ color: "var(--leaf)" }}>✓</span>{r}
          </li>
        ))}
      </ul>
    </div>
  );
}
