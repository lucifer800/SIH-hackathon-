/**
 * KisanQ admin console. Renders full-screen (outside the farmer PhoneFrame).
 * Mobile + OTP sign-in like the rest of KisanQ, then one page per entity group
 * with the management actions wired to the pure mutations in ./data.
 */
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { adminStore, mutate, overview, type EventKind } from "./data";
import { useAdmin, Card, Stat, Badge, Table, Btn, BtnRow, money, type Col } from "./ui";
import "./admin.css";

/* ------------------------------------------------------------------ toast */
const ToastCtx = createContext<(m: string) => void>(() => {});
const useToast = () => useContext(ToastCtx);

/* run a mutation and toast the result (or the error message) */
function useAction() {
  const toast = useToast();
  return useCallback(<A extends unknown[]>(fn: (s: any, ...a: A) => string, ...args: A) => {
    try { toast(adminStore.run(fn as any, ...args)); }
    catch (e: any) { toast(e?.message ?? "That could not be done."); }
  }, [toast]);
}

/* ---------------------------------------------------------------- sections */

const SECTIONS = [
  "Overview", "Farmers", "Centres", "Bookings", "Live queue",
  "Lots", "Payments", "Messages", "Rates", "Disruptions", "Grievances", "Audit log",
] as const;
type Section = (typeof SECTIONS)[number];

export function AdminApp() {
  const [msg, setMsg] = useState("");
  const timer = useRef<number>();
  const toast = useCallback((m: string) => {
    setMsg(m); window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(""), 3600);
  }, []);

  const authed = adminStore.isAuthed();
  useAdmin(); // subscribe so login/logout re-render

  return (
    <ToastCtx.Provider value={toast}>
      {authed ? <Console /> : <AdminLogin />}
      <div className={"ad-toast" + (msg ? " ad-toast-show" : "")} role="status" aria-live="polite">{msg}</div>
    </ToastCtx.Provider>
  );
}

/* -------------------------------------------------------------------- login */

function AdminLogin() {
  const [step, setStep] = useState<"mobile" | "otp">("mobile");
  const [mobile, setMobile] = useState("");
  const [code, setCode] = useState("");
  const [dev, setDev] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const digits = mobile.replace(/\D/g, "").slice(0, 10);

  async function send() {
    if (digits.length !== 10) return setErr("Enter a 10-digit mobile number.");
    setErr(""); setBusy(true);
    try { const r = await adminStore.requestOtp("+91" + digits); setDev(r.devCode); setStep("otp"); }
    finally { setBusy(false); }
  }
  async function verify() {
    setErr(""); setBusy(true);
    try { await adminStore.verifyOtp("+91" + digits, code); }
    catch (e: any) { setErr(e?.message ?? "Try again."); setCode(""); }
    finally { setBusy(false); }
  }

  return (
    <div className="ad-login">
      <div className="ad-login-card">
        <div className="ad-glyph" style={{ width: 52, height: 52, borderRadius: 16, fontSize: 27 }}>ਕ</div>
        <h1>KisanQ Admin</h1>
        <p>Procurement control — Ludhiana district. Staff sign-in.</p>
        {err && <p className="ad-err">{err}</p>}
        {step === "mobile" ? (
          <>
            <div className="ad-field">
              <label htmlFor="m">Registered staff mobile</label>
              <input id="m" className="ad-input" inputMode="numeric" autoFocus placeholder="98765 43210"
                value={digits} onChange={(e) => setMobile(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()} />
            </div>
            <button className="ad-cta" disabled={busy} onClick={send}>{busy ? "Sending…" : "Send code"}</button>
          </>
        ) : (
          <>
            {dev && <p className="ad-devcode">demo code: {dev}</p>}
            <div className="ad-field">
              <label htmlFor="c">4-digit code sent to +91 {digits}</label>
              <input id="c" className="ad-input" inputMode="numeric" autoFocus maxLength={4} placeholder="••••"
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                onKeyDown={(e) => e.key === "Enter" && verify()}
                style={{ letterSpacing: ".5em", fontSize: 22, textAlign: "center" }} />
            </div>
            <button className="ad-cta" disabled={busy || code.length < 4} onClick={verify}>{busy ? "Verifying…" : "Sign in"}</button>
            <button onClick={() => { setStep("mobile"); setCode(""); setErr(""); }}
              style={{ marginTop: 12, color: "var(--muted)", fontWeight: 700, fontSize: 14 }}>Change number</button>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ console */

function Console() {
  const [section, setSection] = useState<Section>("Overview");
  const s = useAdmin();
  // Mutations edit state in place (same object reference), so memoising on `s`
  // would go stale. overview() is a cheap pass — just run it each render.
  const o = overview(s);
  const counts: Partial<Record<Section, number>> = {
    Farmers: s.farmers.length, Centres: s.centres.length, Bookings: s.bookings.length,
    "Live queue": o.inQueue, Payments: o.paymentsHeld, Grievances: o.openGrievances,
    Disruptions: s.events.length,
  };

  return (
    <div className="ad-root">
      <aside className="ad-rail">
        <div className="ad-brand">
          <div className="ad-glyph">ਕ</div>
          <div><b>KisanQ</b><span>Admin</span></div>
        </div>
        <nav className="ad-nav">
          {SECTIONS.map((name) => (
            <button key={name} className={"ad-navitem" + (section === name ? " ad-navitem-on" : "")} onClick={() => setSection(name)}>
              <span>{name}</span>
              {counts[name] ? <span className="ad-navcount">{counts[name]}</span> : null}
            </button>
          ))}
        </nav>
        <div className="ad-railfoot">
          Signed in as <b>{s.admin?.name}</b><br />{s.admin?.mobile}
          <button className="ad-signout" onClick={() => adminStore.logout()}>Sign out</button>
        </div>
      </aside>
      <main className="ad-main">
        <Body section={section} onJump={setSection} />
      </main>
    </div>
  );
}

function Head({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="ad-head">
      <div><h1>{title}</h1><p>{sub}</p></div>
      <span className="ad-mock">Demo data · mock API</span>
    </div>
  );
}

function Body({ section, onJump }: { section: Section; onJump: (s: Section) => void }) {
  switch (section) {
    case "Overview": return <Overview onJump={onJump} />;
    case "Farmers": return <Farmers />;
    case "Centres": return <Centres />;
    case "Bookings": return <Bookings />;
    case "Live queue": return <LiveQueue />;
    case "Lots": return <Lots />;
    case "Payments": return <Payments />;
    case "Messages": return <Messages />;
    case "Rates": return <Rates />;
    case "Disruptions": return <Disruptions />;
    case "Grievances": return <Grievances />;
    case "Audit log": return <AuditLog />;
  }
}

/* -------- Overview -------- */
function Overview({ onJump }: { onJump: (s: Section) => void }) {
  const s = useAdmin();
  const o = overview(s);
  const fill = o.capacityQtl ? Math.round((o.bookedQtl / o.capacityQtl) * 100) : 0;
  return (
    <>
      <Head title="Overview" sub="Ludhiana district · today, 10 September 2026" />
      <div className="ad-grid">
        <Stat label="Registered farmers" value={o.farmers} />
        <Stat label="Centres open" value={`${o.centresOpen}/${o.centres}`} tone={o.centresOpen < o.centres ? "warn" : "good"} />
        <Stat label="Bookings today" value={o.bookingsToday} sub={`${o.activeBookings} active`} />
        <Stat label="In queue now" value={o.inQueue} sub={`${o.servedToday} served`} />
        <Stat label="Capacity booked" value={`${fill}%`} sub={`${o.bookedQtl} / ${o.capacityQtl} qtl`} tone={fill > 90 ? "warn" : "good"} />
        <Stat label="Procured value" value={money.format(o.procurementValue)} />
        <Stat label="Payments held" value={o.paymentsHeld} tone={o.paymentsHeld ? "bad" : "good"} />
        <Stat label="Over 48h (DBT)" value={o.paymentsOver48h} tone={o.paymentsOver48h ? "warn" : "good"} />
        <Stat label="Open grievances" value={o.openGrievances} tone={o.openGrievances ? "warn" : "good"} />
      </div>
      <Card title="Needs attention">
        <BtnRow>
          {o.paymentsHeld > 0 && <Btn kind="danger" onClick={() => onJump("Payments")}>{o.paymentsHeld} payment(s) held → resolve</Btn>}
          {o.openGrievances > 0 && <Btn onClick={() => onJump("Grievances")}>{o.openGrievances} open grievance(s)</Btn>}
          {s.centres.some((c) => c.dayStatus !== "open") && <Btn onClick={() => onJump("Centres")}>Centre(s) not open</Btn>}
          {o.paymentsHeld === 0 && o.openGrievances === 0 && <span className="ad-sub">Nothing urgent. All centres and payments are healthy.</span>}
        </BtnRow>
      </Card>
    </>
  );
}

/* -------- Farmers -------- */
function Farmers() {
  const s = useAdmin();
  const act = useAction();
  const cols: Col<(typeof s.farmers)[number]>[] = [
    { key: "name", head: "Name", cell: (f) => <><span className="ad-strong">{f.name}</span><div className="ad-sub">{f.mobile}</div></> },
    { key: "role", head: "Role", cell: (f) => <Badge>{f.role}</Badge> },
    { key: "vill", head: "Village", cell: (f) => <>{f.village}<div className="ad-sub">{f.district}</div></> },
    { key: "crop", head: "Crop", cell: (f) => f.crop },
    { key: "ent", head: "Entitlement", align: "right", cell: (f) => <span className="ad-mono">{f.usedQtl}/{f.entitlementQtl}</span> },
    { key: "prio", head: "Priority", align: "right", cell: (f) => <span className="ad-mono">{f.priorityScore}{f.noShowCount ? <span className="ad-sub"> · {f.noShowCount} no-show</span> : null}</span> },
    { key: "act", head: "Manage", cell: (f) => (
      <BtnRow>
        {f.role === "farmer"
          ? <Btn onClick={() => act(mutate.setRole, f.id, "operator")}>Make operator</Btn>
          : f.role === "operator"
          ? <Btn onClick={() => act(mutate.setRole, f.id, "farmer")}>Make farmer</Btn>
          : null}
      </BtnRow>
    ) },
  ];
  return (<><Head title="Farmers & staff" sub={`${s.farmers.length} registered accounts`} /><Card><Table cols={cols} rows={s.farmers} /></Card></>);
}

/* -------- Centres -------- */
function Centres() {
  const s = useAdmin();
  const act = useAction();
  const cols: Col<(typeof s.centres)[number]>[] = [
    { key: "name", head: "Centre", cell: (c) => <><span className="ad-strong">{c.name}</span><div className="ad-sub">{c.code} · {c.lanes} lanes</div></> },
    { key: "cap", head: "Capacity", cell: (c) => <>min(weighbridge {c.weighbridgeQtlDay}, bags {c.gunnyBags}×{c.qtlPerBag}, godown {c.godownFreeQtl})<div className="ad-sub">= {c.capacityQtl} qtl / day</div></> },
    { key: "booked", head: "Booked today", align: "right", cell: (c) => <span className="ad-mono">{c.bookedTrolleys}/{c.capacityTrolleys} tr · {c.bookedQtl}/{c.capacityQtl} qtl</span> },
    { key: "day", head: "Today", cell: (c) => <Badge>{c.dayStatus}</Badge> },
    { key: "active", head: "Active", cell: (c) => <Badge>{c.active ? "active" : "closed"}</Badge> },
    { key: "act", head: "Manage", cell: (c) => (
      <BtnRow>
        {c.dayStatus !== "open" ? <Btn kind="primary" onClick={() => act(mutate.setDayStatus, c.id, "open")}>Open</Btn>
          : <Btn onClick={() => act(mutate.setDayStatus, c.id, "paused")}>Pause</Btn>}
        <Btn kind="danger" onClick={() => act(mutate.setDayStatus, c.id, "closed")}>Close</Btn>
        <Btn onClick={() => act(mutate.setCentreActive, c.id, !c.active)}>{c.active ? "Deactivate" : "Activate"}</Btn>
      </BtnRow>
    ) },
  ];
  return (<><Head title="Centres & capacity" sub="Capacity = min(weighbridge, gunny bags, godown). Pausing stops new bookings." /><Card><Table cols={cols} rows={s.centres} /></Card></>);
}

/* -------- Bookings -------- */
function Bookings() {
  const s = useAdmin();
  const act = useAction();
  const [f, setF] = useState<"all" | "active">("active");
  const rows = f === "active" ? s.bookings.filter((b) => b.status === "booked" || b.status === "checked_in") : s.bookings;
  const centreName = (id: string) => s.centres.find((c) => c.id === id)?.name ?? id;
  const cols: Col<(typeof s.bookings)[number]>[] = [
    { key: "ref", head: "Ref", cell: (b) => <><span className="ad-mono ad-strong">{b.ref}</span><div className="ad-sub">via {b.via}</div></> },
    { key: "farmer", head: "Farmer", cell: (b) => <>{b.farmerName}<div className="ad-sub">{b.mobile}</div></> },
    { key: "centre", head: "Centre · slot", cell: (b) => <>{centreName(b.centreId)}<div className="ad-sub">{b.date} · {b.slot}</div></> },
    { key: "qty", head: "Crop · qtl", align: "right", cell: (b) => <span className="ad-mono">{b.crop} · {b.qtl}</span> },
    { key: "pool", head: "Pool", cell: (b) => <Badge>{b.pool}</Badge> },
    { key: "status", head: "Status", cell: (b) => <Badge>{b.status}</Badge> },
    { key: "act", head: "Manage", cell: (b) => {
      const done = b.status === "served" || b.status === "cancelled";
      return (
        <BtnRow>
          <Btn kind="danger" disabled={done} onClick={() => act(mutate.cancelBooking, b.ref)}>Cancel</Btn>
          <Btn disabled={done || b.status === "no_show"} onClick={() => act(mutate.markNoShow, b.ref)}>No-show</Btn>
        </BtnRow>
      );
    } },
  ];
  return (
    <>
      <Head title="Bookings" sub="Cancel returns capacity to the pool; a no-show also docks the farmer's priority." />
      <Card action={<BtnRow>
        <Btn kind={f === "active" ? "primary" : "ghost"} onClick={() => setF("active")}>Active</Btn>
        <Btn kind={f === "all" ? "primary" : "ghost"} onClick={() => setF("all")}>All</Btn>
      </BtnRow>}>
        <Table cols={cols} rows={rows} />
      </Card>
    </>
  );
}

/* -------- Live queue -------- */
function LiveQueue() {
  const s = useAdmin();
  const act = useAction();
  return (
    <>
      <Head title="Live queue" sub="Tokens are issued at the gate. Serve-next advances the board every farmer and screen sees." />
      {s.centres.map((c) => {
        const toks = s.tokens.filter((tk) => tk.centreId === c.id).sort((a, b) => a.seq - b.seq);
        const waiting = toks.filter((tk) => !tk.served).length;
        const cols: Col<(typeof toks)[number]>[] = [
          { key: "seq", head: "Token", cell: (tk) => <span className="ad-mono ad-strong">{String(tk.seq).padStart(3, "0")}</span> },
          { key: "farmer", head: "Farmer", cell: (tk) => <>{tk.farmerName}<div className="ad-sub">{tk.bookingRef}</div></> },
          { key: "veh", head: "Vehicle", cell: (tk) => tk.vehicleNo ?? <span className="ad-sub">not checked in</span> },
          { key: "win", head: "Window · lane", cell: (tk) => <>{tk.window}{tk.lane ? ` · lane ${tk.lane}` : ""}</> },
          { key: "st", head: "State", cell: (tk) => <Badge>{tk.served ? "served" : "booked"}</Badge> },
        ];
        return (
          <Card key={c.id} title={c.name}
            action={<BtnRow>
              <span className="ad-sub" style={{ alignSelf: "center" }}>Now serving <b className="ad-mono">{String(s.nowServing[c.id] ?? 0).padStart(3, "0")}</b> · {waiting} waiting</span>
              <Btn kind="primary" disabled={!waiting} onClick={() => act(mutate.serveNext, c.id)}>Serve next</Btn>
            </BtnRow>}>
            <Table cols={cols} rows={toks} empty="No tokens at this centre today." />
          </Card>
        );
      })}
    </>
  );
}

/* -------- Lots -------- */
function Lots() {
  const s = useAdmin();
  const cols: Col<(typeof s.lots)[number]>[] = [
    { key: "r", head: "Receipt", cell: (l) => <><span className="ad-mono ad-strong">{l.receiptNo}</span><div className="ad-sub">{l.bookingRef} · {l.weighedLabel}</div></> },
    { key: "f", head: "Farmer", cell: (l) => l.farmerName },
    { key: "crop", head: "Crop", cell: (l) => <>{l.crop}<div className="ad-sub">{l.variety}</div></> },
    { key: "moist", head: "Moisture", align: "right", cell: (l) => <span className="ad-mono" style={{ color: l.moisturePct > l.normPct ? "var(--terra)" : "inherit" }}>{l.moisturePct}% / {l.normPct}%</span> },
    { key: "net", head: "Net qtl", align: "right", cell: (l) => <span className="ad-mono">{l.netQtl}</span> },
    { key: "rate", head: "Rate", align: "right", cell: (l) => <span className="ad-mono">{money.format(l.ratePerQtl)}</span> },
    { key: "amt", head: "Amount", align: "right", cell: (l) => <span className="ad-mono ad-strong">{money.format(l.amount)}</span> },
  ];
  return (<><Head title="Lots & receipts" sub="Immutable weighment records — the digital receipt behind every payment." /><Card><Table cols={cols} rows={s.lots} /></Card></>);
}

/* -------- Payments -------- */
function Payments() {
  const s = useAdmin();
  const act = useAction();
  const cols: Col<(typeof s.payments)[number]>[] = [
    { key: "r", head: "Receipt", cell: (p) => <span className="ad-mono ad-strong">{p.receiptNo}</span> },
    { key: "f", head: "Farmer", cell: (p) => p.farmerName },
    { key: "amt", head: "Amount", align: "right", cell: (p) => <span className="ad-mono">{money.format(p.amount)}</span> },
    { key: "st", head: "Status", cell: (p) => <><Badge>{p.status}</Badge>{p.failureReason ? <div className="ad-sub" style={{ color: "var(--terra)" }}>{p.failureReason}</div> : null}</> },
    { key: "utr", head: "UTR / age", cell: (p) => p.utr ? <span className="ad-mono">{p.utr}</span> : p.hoursOutstanding != null ? <span className="ad-sub" style={{ color: p.hoursOutstanding > 48 ? "var(--terra)" : "var(--muted)" }}>{p.hoursOutstanding}h outstanding</span> : <span className="ad-sub">—</span> },
    { key: "act", head: "Manage", cell: (p) => (
      <BtnRow><Btn kind="primary" disabled={p.status === "credited"} onClick={() => act(mutate.retryPayment, p.receiptNo)}>{p.status === "credited" ? "Credited" : "Retry / credit"}</Btn></BtnRow>
    ) },
  ];
  return (<><Head title="Payments (DBT)" sub="Held and failed payments carry a farmer-readable reason. Retry credits and stamps a UTR." /><Card><Table cols={cols} rows={s.payments} /></Card></>);
}

/* -------- Messages -------- */
function Messages() {
  const s = useAdmin();
  const cols: Col<(typeof s.messages)[number]>[] = [
    { key: "f", head: "To", cell: (m) => m.farmerName },
    { key: "ch", head: "Channel", cell: (m) => <Badge>{m.channel}</Badge> },
    { key: "cat", head: "Category", cell: (m) => <span className="ad-sub ad-strong">{m.category}</span> },
    { key: "body", head: "Message", cell: (m) => <span style={{ maxWidth: 420, display: "inline-block" }}>{m.body}</span> },
    { key: "st", head: "Delivery", cell: (m) => <Badge>{m.status}</Badge> },
    { key: "t", head: "When", cell: (m) => <span className="ad-sub">{m.createdLabel}</span> },
  ];
  return (<><Head title="Message log" sub="Every outbound SMS / IVR / push — nothing is lost. This is what the farmer's alerts screen reads." /><Card><Table cols={cols} rows={s.messages} /></Card></>);
}

/* -------- Rates -------- */
function Rates() {
  const s = useAdmin();
  const max = Math.max(...s.rates.map((r) => r.modal));
  const cols: Col<(typeof s.rates)[number]>[] = [
    { key: "c", head: "Crop", cell: (r) => <span className="ad-strong">{r.crop}</span> },
    { key: "msp", head: "MSP", align: "right", cell: (r) => <span className="ad-mono">{money.format(r.msp)}</span> },
    { key: "modal", head: "Modal (nearby)", align: "right", cell: (r) => <span className="ad-mono">{money.format(r.modal)} <span className="ad-sub">· {r.mandi}</span></span> },
    { key: "d", head: "Δ week", align: "right", cell: (r) => <span className="ad-mono" style={{ color: r.delta > 0 ? "var(--leaf-text)" : r.delta < 0 ? "var(--terra)" : "var(--muted)" }}>{r.delta > 0 ? "+" : ""}{r.delta}</span> },
  ];
  return (
    <>
      <Head title="Crop rates" sub="Today's MSP and nearby modal prices — the same figures the farmer's rates screen shows." />
      <div className="ad-grid" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <Card><Table cols={cols} rows={s.rates} /></Card>
        <Card title="Modal price">
          <div className="ad-bars">
            {s.rates.map((r) => (
              <div key={r.crop} style={{ flex: 1, textAlign: "center" }}>
                <div className={"ad-bar" + (r.modal === max ? " ad-bar-hi" : "")} style={{ height: `${(r.modal / max) * 82}px` }} />
                <div className="ad-sub" style={{ marginTop: 6 }}>{r.crop}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

/* -------- Disruptions -------- */
const EVENT_KINDS: EventKind[] = ["rain", "godown_full", "bag_shortage", "weighbridge_down", "holiday"];
function Disruptions() {
  const s = useAdmin();
  const act = useAction();
  const [centreId, setCentreId] = useState(s.centres[0]?.id ?? "");
  const [kind, setKind] = useState<EventKind>("rain");
  const [note, setNote] = useState("");
  const centreName = (id: string) => s.centres.find((c) => c.id === id)?.name ?? id;
  const cols: Col<(typeof s.events)[number]>[] = [
    { key: "c", head: "Centre", cell: (e) => centreName(e.centreId) },
    { key: "k", head: "Kind", cell: (e) => <Badge>{e.kind}</Badge> },
    { key: "n", head: "Note", cell: (e) => e.note },
    { key: "t", head: "Declared", cell: (e) => <span className="ad-sub">{e.createdLabel}</span> },
  ];
  return (
    <>
      <Head title="Disruptions" sub="Declaring rain / a full godown / a bag shortage pauses the centre and triggers reschedule offers." />
      <Card title="Declare an event">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="ad-field" style={{ margin: 0 }}>
            <label>Centre</label>
            <select className="ad-select" value={centreId} onChange={(e) => setCentreId(e.target.value)}>
              {s.centres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="ad-field" style={{ margin: 0 }}>
            <label>Kind</label>
            <select className="ad-select" value={kind} onChange={(e) => setKind(e.target.value as EventKind)}>
              {EVENT_KINDS.map((k) => <option key={k} value={k}>{k.replace("_", " ")}</option>)}
            </select>
          </div>
          <div className="ad-field" style={{ margin: 0, flex: 1, minWidth: 200 }}>
            <label>Note (optional)</label>
            <input className="ad-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Awaiting lorry lift…" />
          </div>
          <Btn kind="primary" onClick={() => { act(mutate.declareEvent, centreId, kind, note); setNote(""); }}>Declare</Btn>
        </div>
      </Card>
      <Card title="Recent events"><Table cols={cols} rows={s.events} empty="No disruptions declared." /></Card>
    </>
  );
}

/* -------- Grievances -------- */
function Grievances() {
  const s = useAdmin();
  const act = useAction();
  const cols: Col<(typeof s.grievances)[number]>[] = [
    { key: "ref", head: "Ref", cell: (g) => <><span className="ad-mono ad-strong">{g.ref}</span>{g.lotRef ? <div className="ad-sub">{g.lotRef}</div> : null}</> },
    { key: "f", head: "Farmer", cell: (g) => g.farmerName },
    { key: "cat", head: "Category", cell: (g) => <Badge>{g.category}</Badge> },
    { key: "body", head: "Complaint", cell: (g) => <span style={{ maxWidth: 380, display: "inline-block" }}>{g.body}</span> },
    { key: "st", head: "Status", cell: (g) => <Badge>{g.status}</Badge> },
    { key: "act", head: "Manage", cell: (g) => {
      const closed = g.status === "resolved" || g.status === "rejected";
      return (
        <BtnRow>
          {g.status === "open" && <Btn onClick={() => act(mutate.setGrievanceStatus, g.ref, "acknowledged")}>Acknowledge</Btn>}
          <Btn kind="primary" disabled={closed} onClick={() => act(mutate.setGrievanceStatus, g.ref, "resolved")}>Resolve</Btn>
          <Btn kind="danger" disabled={closed} onClick={() => act(mutate.setGrievanceStatus, g.ref, "rejected")}>Reject</Btn>
        </BtnRow>
      );
    } },
  ];
  return (<><Head title="Grievances" sub="Every grievance is tied to a lot or booking ID — the deck's governance promise, made literal." /><Card><Table cols={cols} rows={s.grievances} /></Card></>);
}

/* -------- Audit log -------- */
function AuditLog() {
  const s = useAdmin();
  const cols: Col<(typeof s.audit)[number]>[] = [
    { key: "when", head: "When", cell: (a) => <span className="ad-sub">{a.atLabel}</span> },
    { key: "actor", head: "Actor", cell: (a) => <span className="ad-strong">{a.actor}</span> },
    { key: "action", head: "Action", cell: (a) => <span className="ad-mono">{a.action}</span> },
    { key: "entity", head: "Entity", cell: (a) => <>{a.entity} <span className="ad-sub">{a.entityId}</span></> },
  ];
  return (
    <>
      <Head title="Audit log" sub="Every management action here appends a row — required for anything touching money or tokens." />
      <Card action={<Btn kind="danger" onClick={() => adminStore.reset()}>Reset demo data</Btn>}>
        <Table cols={cols} rows={s.audit} />
      </Card>
    </>
  );
}
