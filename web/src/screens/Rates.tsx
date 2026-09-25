import { useState } from "react";
import { api } from "../api";
import { useI18n } from "../i18n/context";
import { fmtNumber } from "../i18n/format";
import { translateCentreName } from "../i18n/centreNames";
import { useQuery } from "../hooks/useQuery";
import { StatusBar, ScreenBody, TabBar } from "../ui";

const CROP_KEYS = ["Wheat", "Paddy", "Maize"] as const;
const CROP_I18N: Record<string, string> = { Wheat: "cropWheat", Paddy: "cropPaddy", Maize: "cropMaize" };

export function Rates() {
  const { t, lang, font } = useI18n();
  const [crop, setCrop] = useState<string>("Wheat");
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);
  const { data: r, loading, error, refetch } = useQuery(() => api.rates(crop), [crop]);

  const displayedPrice = r && selectedDayIndex !== null && r.trend[selectedDayIndex] ? r.trend[selectedDayIndex].value : r?.today;

  return (
    <>
      <StatusBar right={t("cropRates")} />
      <ScreenBody style={{ display: "flex", flexDirection: "column" }}>
        <div className="fade-in" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            {CROP_KEYS.map((c) => (
              <button key={c} type="button" onClick={() => setCrop(c)}
                style={{ flex: 1, minHeight: 54, borderRadius: 20, border: 0, background: c === crop ? "var(--green-ink)" : "rgba(30,59,35,.08)", color: c === crop ? "var(--on-dark)" : "var(--muted)", fontSize: 14.5, fontWeight: 800, fontFamily: font }}>
                {t(CROP_I18N[c])}
              </button>
            ))}
          </div>

          {error ? (
            <div style={{ margin: "auto 0", padding: "26px 22px", borderRadius: 26, background: "rgba(194,82,31,.08)", textAlign: "center" }}>
              <div style={{ fontSize: 15.5, fontWeight: 700, color: "var(--terra)" }}>{t("errorRetry")}</div>
              <button type="button" onClick={refetch} style={{ marginTop: 14, padding: "10px 24px", borderRadius: 999, background: "var(--terra)", color: "#fff", fontSize: 14, fontWeight: 800 }}>{t("retry")}</button>
            </div>
          ) : loading || !r ? (
            <div style={{ display: "grid", gap: 14, marginTop: 24 }}>
              <div style={{ height: 70, borderRadius: 22, background: "rgba(30,59,35,.06)", animation: "sk-pulse 1.5s ease-in-out infinite" }} />
              <div style={{ height: 148, borderRadius: 26, background: "rgba(30,59,35,.06)", animation: "sk-pulse 1.5s ease-in-out infinite" }} />
              <div style={{ height: 60, borderRadius: 22, background: "rgba(30,59,35,.06)", animation: "sk-pulse 1.5s ease-in-out infinite" }} />
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
                <div className="h-display" style={{ fontWeight: 700, fontSize: 56, lineHeight: .95 }}>₹{fmtNumber(displayedPrice || r.today, lang)}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: r.delta >= 0 ? "var(--leaf)" : "var(--terra)" }}>
                  {r.delta >= 0 ? "▲" : "▼"} ₹{fmtNumber(Math.abs(r.delta), lang)} {t("thisWeek")}
                </div>
              </div>
              <div style={{ marginTop: 4, fontSize: 14.5, fontWeight: 700, color: "var(--muted)", fontFamily: font }}>{t("mspLabel")} {t("perQuintal")}</div>

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

              <div style={{ marginTop: "auto", padding: "16px 20px", borderRadius: 24, background: "var(--amber-soft)", fontSize: 14, fontWeight: 700, lineHeight: 1.55, color: "var(--amber-text-2)", fontFamily: font }}>
                {r.advice[lang]}
              </div>
            </>
          )}
        </div>
      </ScreenBody>
      <TabBar />
    </>
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
