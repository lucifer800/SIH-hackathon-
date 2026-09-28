import { useState } from "react";
import { api } from "../api";
import { useI18n } from "../i18n/context";
import { fmtNumber } from "../i18n/format";
import { translateCentreName } from "../i18n/centreNames";
import { useQuery } from "../hooks/useQuery";
import { useToast } from "../ui";

export const CROP_KEYS = ["Wheat", "Paddy", "Maize"] as const;
export const CROP_I18N: Record<string, string> = { Wheat: "cropWheat", Paddy: "cropPaddy", Maize: "cropMaize" };
const TRANSPORT_RATE_PER_KM_PER_QTL = 4; // ₹ — standard Punjab tractor-trolley rate

/** Shared crop-chip row — one crop selection drives all three Market sub-tabs. */
export function CropChips({ crop, onCrop, font }: { crop: string; onCrop: (c: string) => void; font: string }) {
  const { t } = useI18n();
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
      {CROP_KEYS.map((c) => (
        <button key={c} type="button" onClick={() => onCrop(c)}
          style={{ flex: 1, minHeight: 54, borderRadius: 20, border: 0, background: c === crop ? "var(--green-ink)" : "rgba(30,59,35,.08)", color: c === crop ? "var(--on-dark)" : "var(--muted)", fontSize: 14.5, fontWeight: 800, fontFamily: font }}>
          {t(CROP_I18N[c])}
        </button>
      ))}
    </div>
  );
}

/** Prices sub-tab: today's price, 7-day trend, nearby mandis, advisory. */
export function PricesPanel({ crop }: { crop: string }) {
  const { t, lang, font } = useI18n();
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);
  const { data: r, loading, error, refetch } = useQuery(() => api.rates(crop), [crop]);
  const displayedPrice = r && selectedDayIndex !== null && r.trend[selectedDayIndex] ? r.trend[selectedDayIndex].value : r?.today;

  if (error) {
    return (
      <div style={{ margin: "auto 0", padding: "26px 22px", borderRadius: 26, background: "rgba(194,82,31,.08)", textAlign: "center" }}>
        <div style={{ fontSize: 15.5, fontWeight: 700, color: "var(--terra)" }}>{t("errorRetry")}</div>
        <button type="button" onClick={refetch} style={{ marginTop: 14, padding: "10px 24px", borderRadius: 999, background: "var(--terra)", color: "#fff", fontSize: 14, fontWeight: 800 }}>{t("retry")}</button>
      </div>
    );
  }
  if (loading || !r) {
    return (
      <div style={{ display: "grid", gap: 14, marginTop: 24 }}>
        <div style={{ height: 70, borderRadius: 22, background: "rgba(30,59,35,.06)", animation: "sk-pulse 1.5s ease-in-out infinite" }} />
        <div style={{ height: 148, borderRadius: 26, background: "rgba(30,59,35,.06)", animation: "sk-pulse 1.5s ease-in-out infinite" }} />
        <div style={{ height: 60, borderRadius: 22, background: "rgba(30,59,35,.06)", animation: "sk-pulse 1.5s ease-in-out infinite" }} />
      </div>
    );
  }
  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
        <div className="h-display" style={{ fontWeight: 700, fontSize: 56, lineHeight: .95 }}>₹{fmtNumber(displayedPrice || r.today, lang)}</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: r.delta >= 0 ? "var(--leaf)" : "var(--terra)" }}>
          {r.delta >= 0 ? "▲" : "▼"} ₹{fmtNumber(Math.abs(r.delta), lang)} {t("thisWeek")}
        </div>
      </div>
      <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 14.5, fontWeight: 700, color: "var(--muted)", fontFamily: font }}>{t("mspLabel")} {t("perQuintal")}</span>
        <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 99, background: r.source === "data.gov.in" ? "var(--leaf)" : "rgba(30,59,35,.12)", color: r.source === "data.gov.in" ? "#fff" : "var(--muted)" }}>
          {r.source === "data.gov.in" ? "● LIVE" : "DEMO"}
        </span>
      </div>

      <Chart trend={r.trend} selectedDayIndex={selectedDayIndex} onDaySelect={setSelectedDayIndex} />

      <div className="eyebrow" style={{ marginTop: 22 }}>{t("nearbyMandis")}</div>
      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {r.nearby.map((m: { mandi: string; price: number }) => (
          <div key={m.mandi} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 60, padding: "0 20px", borderRadius: 22, background: "#fff", boxShadow: "0 8px 20px rgba(30,59,35,.06)" }}>
            <span style={{ fontSize: 15.5, fontWeight: 800 }}>{translateCentreName(m.mandi, lang)}</span>
            <span className="h-display" style={{ fontSize: 19 }}>₹{fmtNumber(m.price, lang)}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, padding: "16px 20px", borderRadius: 24, background: "var(--amber-soft)", fontSize: 14, fontWeight: 700, lineHeight: 1.55, color: "var(--amber-text-2)", fontFamily: font }}>
        {r.advice[lang]}
      </div>
    </>
  );
}

/** Alerts sub-tab: set/clear a price threshold for the selected crop. */
export function AlertsPanel({ crop }: { crop: string }) {
  const { t, font } = useI18n();
  const toast = useToast();
  const [alertTarget, setAlertTarget] = useState("");
  const [alertSaving, setAlertSaving] = useState(false);
  const { data: alerts, refetch: refetchAlerts } = useQuery(() => api.getAlerts(), []);
  const activeAlert = alerts?.find((a) => a.crop === crop);

  return (
    <div style={{ marginTop: 20, padding: "16px 18px", borderRadius: 24, background: "var(--field)" }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".07em", color: "var(--muted)", fontFamily: font, marginBottom: 10 }}>
        {activeAlert ? `🔔 ${t("alertSet")} ₹${activeAlert.targetPrice}` : t("setPriceAlert")}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="number" min={0} max={10000} placeholder="₹ / qtl"
          value={alertTarget}
          onChange={(e) => setAlertTarget(e.target.value)}
          style={{ flex: 1, height: 44, borderRadius: 14, border: "2px solid var(--border)", padding: "0 14px", fontSize: 15, fontWeight: 700, background: "#fff", color: "var(--green-ink)" }}
        />
        <button type="button" disabled={alertSaving || !alertTarget}
          onClick={async () => {
            const v = Number(alertTarget);
            if (!v || v <= 0) return;
            setAlertSaving(true);
            try { await api.setAlert(crop, v); setAlertTarget(""); refetchAlerts(); toast(t("alertSaved")); }
            catch { toast(t("errorRetry")); }
            finally { setAlertSaving(false); }
          }}
          style={{ height: 44, padding: "0 18px", borderRadius: 14, border: 0, background: "var(--green-ink)", color: "#fff", fontSize: 14, fontWeight: 800, fontFamily: font, opacity: alertSaving ? .6 : 1 }}>
          {alertSaving ? "…" : t("save")}
        </button>
        {activeAlert && (
          <button type="button" onClick={async () => { await api.deleteAlert(activeAlert.id); refetchAlerts(); }}
            style={{ height: 44, width: 44, borderRadius: 14, border: 0, background: "rgba(194,82,31,.1)", color: "var(--terra)", fontSize: 18 }}>
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

/** Transport sub-tab: distance + trolley-weight sliders against today's price. */
export function TransportPanel({ crop }: { crop: string }) {
  const { font } = useI18n();
  const [distance, setDistance] = useState(30);
  const [trolleyQtl, setTrolleyQtl] = useState(5);
  const { data: r, loading } = useQuery(() => api.rates(crop), [crop]);

  if (loading || !r) {
    return <div style={{ height: 260, marginTop: 20, borderRadius: 26, background: "rgba(30,59,35,.06)", animation: "sk-pulse 1.5s ease-in-out infinite" }} />;
  }
  return (
    <div style={{ marginTop: 20 }}>
      <TransportSlider mandiPrice={r.today} distance={distance} onDistance={setDistance} trolleyQtl={trolleyQtl} onTrolleyQtl={setTrolleyQtl} font={font} />
    </div>
  );
}

function TransportSlider({ mandiPrice, distance, onDistance, trolleyQtl, onTrolleyQtl, font }: {
  mandiPrice: number; distance: number; onDistance: (v: number) => void;
  trolleyQtl: number; onTrolleyQtl: (v: number) => void; font: string;
}) {
  const { t } = useI18n();
  const costPerQtl = distance * TRANSPORT_RATE_PER_KM_PER_QTL;
  const netPrice = Math.max(0, mandiPrice - costPerQtl);
  const totalCost = costPerQtl * trolleyQtl;
  const saving = mandiPrice - netPrice;
  const pct = mandiPrice > 0 ? Math.round((saving / mandiPrice) * 100) : 0;

  return (
    <div style={{ padding: "20px 18px 18px", borderRadius: 22, background: "var(--green-ink)" }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--on-dark-3)", fontFamily: font }}>{t("distanceToMandi")}</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: "var(--marigold)" }}>{distance} km</span>
        </div>
        <input type="range" min={1} max={200} step={1} value={distance}
          onChange={(e) => onDistance(Number(e.target.value))}
          style={{ width: "100%", accentColor: "var(--marigold)", height: 4, cursor: "pointer" }} />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,.4)", fontWeight: 700 }}>1 km</span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,.4)", fontWeight: 700 }}>200 km</span>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--on-dark-3)", fontFamily: font }}>{t("trolleyWeight")}</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: "var(--marigold)" }}>{trolleyQtl} qtl</span>
        </div>
        <input type="range" min={1} max={20} step={1} value={trolleyQtl}
          onChange={(e) => onTrolleyQtl(Number(e.target.value))}
          style={{ width: "100%", accentColor: "var(--marigold)", height: 4, cursor: "pointer" }} />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,.4)", fontWeight: 700 }}>1 qtl</span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,.4)", fontWeight: 700 }}>20 qtl</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div style={{ padding: "14px 16px", borderRadius: 18, background: "rgba(255,255,255,.08)" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,.5)", fontFamily: font, marginBottom: 4 }}>{t("transportCost")}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "var(--terra)" }}>₹{Math.round(costPerQtl)}<span style={{ fontSize: 12 }}>/qtl</span></div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.4)", marginTop: 2 }}>₹{Math.round(totalCost)} {t("total")}</div>
        </div>
        <div style={{ padding: "14px 16px", borderRadius: 18, background: "rgba(255,248,236,.12)", border: "2px solid var(--marigold)" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--marigold)", fontFamily: font, marginBottom: 4 }}>{t("netAtDoor")}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>₹{Math.round(netPrice)}<span style={{ fontSize: 12 }}>/qtl</span></div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.4)", marginTop: 2 }}>−{pct}% {t("ofMandiPrice")}</div>
        </div>
      </div>
      <div style={{ marginTop: 12, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.35)", fontFamily: font, textAlign: "center" }}>
        {t("transportRateNote")} ₹{TRANSPORT_RATE_PER_KM_PER_QTL}/km/qtl
      </div>
    </div>
  );
}

function Chart({ trend, selectedDayIndex, onDaySelect }: { trend: { day: string; value: number }[]; selectedDayIndex: number | null; onDaySelect: (index: number) => void }) {
  const max = Math.max(...trend.map((p) => p.value));
  const min = Math.min(...trend.map((p) => p.value));
  const span = Math.max(1, max - min);
  const sorted = [...trend].map((p) => p.value).sort((a, b) => b - a);
  const secondHighest = sorted[1];
  return (
    <div className="card" style={{ marginTop: 22, borderRadius: 26, padding: 18, height: 148, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 8 }}>
        {trend.map((p, i) => {
          const isToday = i === trend.length - 1;
          const isSelected = selectedDayIndex === i;
          const isSecond = p.value === secondHighest && !isToday;
          const h = 20 + ((p.value - min) / span) * 78;
          return (
            <div key={i} onClick={() => onDaySelect(i)} style={{ flex: 1, height: `${h}%`, borderRadius: "12px 12px 5px 5px", background: isSelected ? "var(--green-ink)" : isToday ? "var(--terra)" : isSecond ? "var(--marigold)" : "var(--chart-neutral)", border: isSelected ? "3px solid var(--leaf)" : "none", transition: "height .4s ease", cursor: "pointer" }} />
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        {trend.map((p, i) => <div key={i} style={{ flex: 1, textAlign: "center", fontSize: 12.5, fontWeight: 800, color: "var(--muted-2)" }}>{p.day}</div>)}
      </div>
    </div>
  );
}
