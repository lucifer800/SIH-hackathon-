import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Centre, type Slot } from "../api";
import { useI18n } from "../i18n/context";
import { StatusBar, ScreenBody, TabBar, useToast } from "../ui";

const DATES = [
  { value: "2026-09-10", label: "Thu 10 Sep" },
  { value: "2026-09-11", label: "Fri 11 Sep" },
  { value: "2026-09-12", label: "Sat 12 Sep" },
];

export function Book() {
  const { t, font } = useI18n();
  const nav = useNavigate();
  const toast = useToast();
  const [centres, setCentres] = useState<Centre[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [centreId, setCentreId] = useState<string>("");
  const [date, setDate] = useState(DATES[0].value);
  const [slotId, setSlotId] = useState<string>("");
  const [qtl, setQtl] = useState(18);
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.centres().then((c) => { setCentres(c); setCentreId(c[0]?.id ?? ""); });
    api.dashboard("en").then((d) => setRemaining(Math.max(0, d.holding.entitlementQtl - d.holding.usedQtl)));
  }, []);
  useEffect(() => {
    if (centreId) api.slots(centreId, date).then((s) => { setSlots(s); setSlotId(""); });
  }, [centreId, date]);

  const slot = slots.find((s) => s.id === slotId);
  const overEntitlement = qtl > remaining;

  async function book() {
    if (!slot) return toast(t("chooseSlot"));
    if (slot.bookedTrolleys >= slot.capacityTrolleys) return toast(t("full"));
    if (overEntitlement) return toast(`Only ${remaining.toFixed(1)} qtl left on your land record.`);
    setBusy(true);
    try {
      const appt = await api.book({ centreId, date, slotId, slot: slot.time, end: slot.end, qtl });
      toast(`${appt.ref} ✓ · ${t("gateOtp")} ${appt.gateOtp}`);
      window.dispatchEvent(new Event("kq-auth"));
      nav("/home");
    } finally { setBusy(false); }
  }

  return (
    <>
      <StatusBar right="BOOK" />
      <ScreenBody style={{ display: "flex", flexDirection: "column" }}>
        <div className="fade-in" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <h2 className="h-display" style={{ margin: "6px 0 20px", fontSize: 31 }}>{t("bookVisit")}</h2>

          <StepLabel n={1} text={t("chooseCentre")} />
          <div style={{ display: "grid", gap: 10 }}>
            {centres.map((c) => {
              const on = c.id === centreId;
              return (
                <button key={c.id} type="button" onClick={() => setCentreId(c.id)}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 64, borderRadius: 24, padding: "0 20px", border: `2.5px solid ${on ? "var(--leaf)" : "var(--line)"}`, background: on ? "rgba(87,120,63,.12)" : "#fff", color: on ? "var(--leaf-text)" : "var(--muted)", fontSize: 16, fontWeight: 800 }}>
                  {c.name.replace(" Procurement Centre", "")}
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{c.distanceKm} km</span>
                </button>
              );
            })}
          </div>

          <StepLabel n={2} text={`${t("chooseDate")} · ${t("chooseSlot")}`} />
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {DATES.map((dt) => (
              <button key={dt.value} type="button" onClick={() => setDate(dt.value)}
                style={{ flex: 1, minHeight: 44, borderRadius: 16, border: 0, background: dt.value === date ? "var(--green-ink)" : "rgba(30,59,35,.08)", color: dt.value === date ? "var(--on-dark)" : "var(--muted)", fontSize: 13, fontWeight: 800 }}>
                {dt.label}
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {slots.map((s) => {
              const full = s.bookedTrolleys >= s.capacityTrolleys;
              const open = s.capacityTrolleys - s.bookedTrolleys;
              const on = s.id === slotId;
              return (
                <button key={s.id} type="button" disabled={full} onClick={() => setSlotId(s.id)}
                  style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 5, minHeight: 82, borderRadius: 24, padding: "16px 18px", textAlign: "left", opacity: full ? .5 : 1, border: `2.5px solid ${on ? "var(--leaf)" : "var(--line)"}`, background: on ? "rgba(87,120,63,.12)" : "#fff" }}>
                  <span className="h-display" style={{ fontSize: 21 }}>{s.time.replace(/ ?[AP]M/, "")}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: full ? "var(--terra)" : s.pool === "small_holder" ? "var(--leaf)" : "var(--muted-2)" }}>
                    {full ? t("full") : s.pool === "small_holder" ? `${open} · ${t("reservedSmall")}` : `${open} ${t("left")}`}
                  </span>
                </button>
              );
            })}
          </div>

          <StepLabel n={3} text={t("quantity")} />
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <input type="range" min={1} max={Math.max(1, Math.ceil(remaining))} value={Math.min(qtl, Math.ceil(remaining))} onChange={(e) => setQtl(Number(e.target.value))} style={{ flex: 1, accentColor: "var(--leaf)" }} />
            <div className="h-display" style={{ fontSize: 26, minWidth: 74, textAlign: "right", color: overEntitlement ? "var(--terra)" : "var(--green-ink)" }}>{qtl} qtl</div>
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 13, fontWeight: 700, color: "var(--muted-2)", fontFamily: font }}>
            {remaining.toFixed(1)} {t("quintalsLeft")} — capped by your land record
          </p>

          <button type="button" className="cta" style={{ marginTop: "auto" }} disabled={busy || !slot} onClick={book}>
            {busy ? <span className="spinner" /> : t("bookIt")}
          </button>
        </div>
      </ScreenBody>
      <TabBar />
    </>
  );
}

function StepLabel({ n, text }: { n: number; text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11, margin: "22px 0 12px" }}>
      <span style={{ display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: "50%", background: "var(--amber-soft)", fontSize: 13.5, fontWeight: 800, color: "var(--amber-text)" }}>{n}</span>
      <span style={{ fontSize: 15, fontWeight: 800 }}>{text}</span>
    </div>
  );
}
