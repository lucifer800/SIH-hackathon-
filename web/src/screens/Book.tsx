import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Slot } from "../api";
import { useI18n } from "../i18n/context";
import { useQuery } from "../hooks/useQuery";
import { StatusBar, ScreenBody, TabBar, useToast } from "../ui";

function nextDates(n: number): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const weekday = d.toLocaleDateString("en", { weekday: "short" });
    const day = d.getDate();
    const month = d.toLocaleDateString("en", { month: "short" });
    out.push({ value: iso, label: `${day} ${month}, ${weekday}` });
  }
  return out;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function useGeo() {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [denied, setDenied] = useState(false);
  const [asking, setAsking] = useState(true);
  useEffect(() => {
    if (!navigator.geolocation) { setAsking(false); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude }); setAsking(false); },
      () => { setDenied(true); setAsking(false); },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }, []);
  return { pos, denied, asking };
}

export function Book() {
  const { t, tpl, font } = useI18n();
  const nav = useNavigate();
  const toast = useToast();
  const dates = useMemo(() => nextDates(3), []);
  const geo = useGeo();

  const { data: init, loading, error, refetch } = useQuery(async () => {
    const [c, d] = await Promise.all([api.centres(), api.dashboard("en")]);
    const rem = Math.max(0, d.holding.entitlementQtl - d.holding.usedQtl);
    return { centres: c, remaining: rem, defaultCentre: c[0]?.id ?? "" };
  }, []);

  const [centreId, setCentreId] = useState("");
  const [date, setDate] = useState(dates[0].value);
  const [slotId, setSlotId] = useState("");
  const [qtl, setQtl] = useState(18);
  const [busy, setBusy] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const remaining = init?.remaining ?? 0;
  const maxQtl = Math.max(1, Math.ceil(remaining));

  const centresWithDist = useMemo(() => {
    if (!init) return [];
    return init.centres.map((c) => {
      if (geo.pos && c.lat != null && c.lng != null) {
        return { ...c, distanceKm: Math.round(haversineKm(geo.pos.lat, geo.pos.lng, c.lat, c.lng)) };
      }
      return c;
    }).sort((a, b) => a.distanceKm - b.distanceKm);
  }, [init, geo.pos]);

  const activeCentre = centreId || centresWithDist[0]?.id || init?.defaultCentre || "";

  const { data: slots } = useQuery(
    () => activeCentre ? api.slots(activeCentre, date) : Promise.resolve([]),
    [activeCentre, date],
  );
  const slotList = slots ?? [];
  const slot = slotList.find((s: Slot) => s.id === slotId);
  const overEntitlement = qtl > remaining;

  const adjustQtl = useCallback((delta: number) => {
    setQtl((prev) => Math.max(1, Math.min(maxQtl, prev + delta)));
  }, [maxQtl]);

  useEffect(() => {
    if (!showConfirm) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowConfirm(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [showConfirm]);

  async function doBook() {
    setShowConfirm(false);
    if (!slot) return toast(t("chooseSlot"));
    if (slot.bookedTrolleys >= slot.capacityTrolleys) return toast(t("full"));
    if (overEntitlement) return toast(tpl("onlyQtlLeft", { n: remaining.toFixed(1) }));
    setBusy(true);
    try {
      const appt = await api.book({ centreId: activeCentre, date, slotId, slot: slot.time, end: slot.end, qtl });
      toast(`${appt.ref} ✓ · ${t("gateOtp")} ${appt.gateOtp}`);
      window.dispatchEvent(new Event("kq-auth"));
      nav("/home");
    } catch (e: any) {
      toast(e.message || t("errorRetry"));
    } finally { setBusy(false); }
  }

  function handleBook() {
    if (!slot) return toast(t("chooseSlot"));
    if (slot.bookedTrolleys >= slot.capacityTrolleys) return toast(t("full"));
    if (overEntitlement) return toast(tpl("onlyQtlLeft", { n: remaining.toFixed(1) }));
    setShowConfirm(true);
  }

  const selectedCentre = centresWithDist.find((c) => c.id === activeCentre);

  return (
    <>
      <StatusBar right={t("tabBook")} />
      <ScreenBody style={{ display: "flex", flexDirection: "column" }}>
        <div className="fade-in" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <h2 className="h-display" style={{ margin: "6px 0 20px", fontSize: 31 }}>{t("bookVisit")}</h2>

          {error ? (
            <div style={{ margin: "auto 0", padding: "26px 22px", borderRadius: 26, background: "rgba(194,82,31,.08)", textAlign: "center" }}>
              <div style={{ fontSize: 15.5, fontWeight: 700, color: "var(--terra)" }}>{t("errorRetry")}</div>
              <button type="button" onClick={refetch} style={{ marginTop: 14, padding: "10px 24px", borderRadius: 999, background: "var(--terra)", color: "#fff", fontSize: 14, fontWeight: 800 }}>{t("retry")}</button>
            </div>
          ) : loading ? (
            <div style={{ display: "grid", gap: 14 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ height: 64, borderRadius: 24, background: "rgba(30,59,35,.06)", animation: "sk-pulse 1.5s ease-in-out infinite" }} />
              ))}
            </div>
          ) : (
            <>
              <StepLabel n={1} text={t("chooseCentre")} />
              {geo.asking && <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", marginBottom: 8, fontFamily: font }}>{t("locating")}</div>}
              {geo.denied && <div style={{ fontSize: 13, fontWeight: 700, color: "var(--terra)", marginBottom: 8, fontFamily: font }}>{t("locationDenied")}</div>}
              <div style={{ display: "grid", gap: 10 }}>
                {centresWithDist.map((c) => {
                  const on = c.id === activeCentre;
                  return (
                    <button key={c.id} type="button" onClick={() => { setCentreId(c.id); setSlotId(""); }}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 64, borderRadius: 24, padding: "0 20px", border: `2.5px solid ${on ? "var(--leaf)" : "var(--line)"}`, background: on ? "rgba(87,120,63,.12)" : "#fff", color: on ? "var(--leaf-text)" : "var(--muted)", fontSize: 16, fontWeight: 800 }}>
                      {c.name.replace(" Procurement Centre", "")}
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{c.distanceKm} km {geo.pos ? t("fromYou") : ""}</span>
                    </button>
                  );
                })}
              </div>

              <StepLabel n={2} text={`${t("chooseDate")} · ${t("chooseSlot")}`} />
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                {dates.map((dt) => (
                  <button key={dt.value} type="button" onClick={() => { setDate(dt.value); setSlotId(""); }}
                    style={{ flex: 1, minHeight: 44, borderRadius: 16, border: 0, background: dt.value === date ? "var(--green-ink)" : "rgba(30,59,35,.08)", color: dt.value === date ? "var(--on-dark)" : "var(--muted)", fontSize: 13, fontWeight: 800 }}>
                    {dt.label}
                  </button>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {slotList.map((s) => {
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
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button type="button" onClick={() => adjustQtl(-1)} style={{ width: 44, height: 44, borderRadius: 14, border: "2px solid var(--line)", background: "#fff", fontSize: 22, fontWeight: 800, color: "var(--green-ink)", lineHeight: 1 }}>−</button>
                <input type="range" min={1} max={maxQtl} value={Math.min(qtl, maxQtl)} onChange={(e) => setQtl(Number(e.target.value))} style={{ flex: 1, accentColor: "var(--leaf)" }} />
                <button type="button" onClick={() => adjustQtl(1)} style={{ width: 44, height: 44, borderRadius: 14, border: "2px solid var(--line)", background: "#fff", fontSize: 22, fontWeight: 800, color: "var(--green-ink)", lineHeight: 1 }}>+</button>
                <div className="h-display" style={{ fontSize: 24, minWidth: 74, textAlign: "right", color: overEntitlement ? "var(--terra)" : "var(--green-ink)" }}>{qtl} {t("qtlUnit")}</div>
              </div>
              <p style={{ margin: "8px 0 0", fontSize: 13, fontWeight: 700, color: "var(--muted-2)", fontFamily: font }}>
                {remaining.toFixed(1)} {t("quintalsLeft")} — {t("cappedByLand")}
              </p>

              <button type="button" className="cta" style={{ marginTop: "auto" }} disabled={busy || !slot} onClick={handleBook}>
                {busy ? <span className="spinner" /> : t("bookIt")}
              </button>
            </>
          )}
        </div>
      </ScreenBody>
      <TabBar />

      {showConfirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.45)" }} onClick={() => setShowConfirm(false)}>
          <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t("confirmBookTitle")} style={{ width: "min(88vw, 340px)", padding: "28px 24px", borderRadius: 28, background: "#fff", boxShadow: "0 16px 48px rgba(0,0,0,.2)", textAlign: "center" }}>
            <div className="h-display" style={{ fontSize: 22, marginBottom: 8 }}>{t("confirmBookTitle")}</div>
            <p style={{ fontSize: 15, fontWeight: 700, color: "var(--muted)", lineHeight: 1.5, fontFamily: font, margin: "0 0 6px" }}>{t("confirmBookMsg")}</p>
            {selectedCentre && slot && (
              <div style={{ margin: "14px 0", padding: "14px 16px", borderRadius: 18, background: "var(--field)", fontSize: 14, fontWeight: 700, lineHeight: 1.6, fontFamily: font, textAlign: "left" }}>
                <div>{selectedCentre.name.replace(" Procurement Centre", "")} · {selectedCentre.distanceKm} km</div>
                <div>{dates.find((d) => d.value === date)?.label} · {slot.time}</div>
                <div>{qtl} {t("qtlUnit")}</div>
              </div>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button type="button" onClick={() => setShowConfirm(false)} style={{ flex: 1, minHeight: 50, borderRadius: 999, border: "2px solid var(--line)", background: "#fff", fontSize: 15, fontWeight: 800, color: "var(--muted)" }}>{t("cancel")}</button>
              <button type="button" onClick={doBook} style={{ flex: 1, minHeight: 50, borderRadius: 999, border: 0, background: "var(--green-ink)", color: "var(--on-dark)", fontSize: 15, fontWeight: 800 }}>{t("confirm")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const STEP_LABEL_STYLES = {
  container: { display: "flex", alignItems: "center", gap: 11, margin: "22px 0 12px" } as const,
  badge: { display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: "50%", background: "var(--amber-soft)", fontSize: 13.5, fontWeight: 800, color: "var(--amber-text)" } as const,
  text: { fontSize: 15, fontWeight: 800 } as const,
};

function StepLabel({ n, text }: { n: number; text: string }) {
  return (
    <div style={STEP_LABEL_STYLES.container}>
      <span style={STEP_LABEL_STYLES.badge}>{n}</span>
      <span style={STEP_LABEL_STYLES.text}>{text}</span>
    </div>
  );
}
