import { useEffect, useState } from "react";
import { api, type Rates as R } from "../api";
import { useI18n } from "../i18n/context";
import { StatusBar, ScreenBody, TabBar } from "../ui";

const CROPS = ["Wheat", "Paddy", "Maize"];

export function Rates() {
  const { t, lang, font } = useI18n();
  const [crop, setCrop] = useState("Wheat");
  const [r, setR] = useState<R | null>(null);

  useEffect(() => { api.rates(crop).then(setR); }, [crop]);

  return (
    <>
      <StatusBar right="RATES" />
      <ScreenBody style={{ display: "flex", flexDirection: "column" }}>
        <div className="fade-in" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            {CROPS.map((c) => (
              <button key={c} type="button" onClick={() => setCrop(c)}
                style={{ flex: 1, minHeight: 54, borderRadius: 20, border: 0, background: c === crop ? "var(--green-ink)" : "rgba(30,59,35,.08)", color: c === crop ? "var(--on-dark)" : "var(--muted)", fontSize: 14.5, fontWeight: 800 }}>
                {c}
              </button>
            ))}
          </div>

          {r ? (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
                <div className="h-display" style={{ fontWeight: 700, fontSize: 56, lineHeight: .95 }}>₹{r.today.toLocaleString("en-IN")}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: r.delta >= 0 ? "var(--leaf)" : "var(--terra)" }}>
                  {r.delta >= 0 ? "▲" : "▼"} ₹{Math.abs(r.delta)} {t("thisWeek")}
                </div>
              </div>
              <div style={{ marginTop: 4, fontSize: 14.5, fontWeight: 700, color: "var(--muted)", fontFamily: font }}>MSP {t("perQuintal")}</div>

              <Chart trend={r.trend} />

              <div className="eyebrow" style={{ marginTop: 22 }}>{t("nearbyMandis")}</div>
              <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                {r.nearby.map((m) => (
                  <div key={m.mandi} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 60, padding: "0 20px", borderRadius: 22, background: "#fff", boxShadow: "0 8px 20px rgba(30,59,35,.06)" }}>
                    <span style={{ fontSize: 15.5, fontWeight: 800 }}>{m.mandi}</span>
                    <span className="h-display" style={{ fontSize: 19 }}>₹{m.price.toLocaleString("en-IN")}</span>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: "auto", padding: "16px 20px", borderRadius: 24, background: "var(--amber-soft)", fontSize: 14, fontWeight: 700, lineHeight: 1.55, color: "var(--amber-text-2)", fontFamily: font }}>
                {r.advice[lang]}
              </div>
            </>
          ) : null}
        </div>
      </ScreenBody>
      <TabBar />
    </>
  );
}

function Chart({ trend }: { trend: { day: string; value: number }[] }) {
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
          const isSecond = p.value === secondHighest && !isToday;
          const h = 20 + ((p.value - min) / span) * 78;
          return (
            <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: "12px 12px 5px 5px", background: isToday ? "var(--terra)" : isSecond ? "var(--marigold)" : "var(--chart-neutral)", transition: "height .4s ease" }} />
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        {trend.map((p, i) => <div key={i} style={{ flex: 1, textAlign: "center", fontSize: 12.5, fontWeight: 800, color: "var(--muted-2)" }}>{p.day}</div>)}
      </div>
    </div>
  );
}
