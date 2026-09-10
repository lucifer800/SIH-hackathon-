/**
 * Admin console data layer — same mock-first pattern as ../api/mock.ts.
 *
 * The admin sees the whole product: farmers, centres and their live capacity,
 * bookings, the gate queue, weighed lots, payments, the message log, rates,
 * disruptions, grievances and an audit trail. Every management action mutates
 * this state AND appends an audit row, so "manage it" is visible in the demo.
 *
 * Shapes mirror src/db/schema.ts on the server; when the admin endpoints land,
 * each read/mutation here becomes a fetch to /api/v1/admin/* with no UI change.
 * Kept English-only on purpose: the three languages are the farmer's promise;
 * a staff console in English is the smaller, correct surface.
 */

export type Role = "farmer" | "assistant" | "operator" | "district" | "admin";
export type BookingStatus = "booked" | "checked_in" | "served" | "no_show" | "cancelled" | "rescheduled";
export type PaymentStatus = "pending" | "initiated" | "credited" | "failed" | "returned";
export type DayStatus = "open" | "paused" | "closed";
export type GrievanceStatus = "open" | "acknowledged" | "resolved" | "rejected";
export type EventKind = "rain" | "godown_full" | "bag_shortage" | "weighbridge_down" | "holiday";

export interface Farmer {
  id: string; name: string; mobile: string; role: Role; district: string; village: string;
  crop: string; entitlementQtl: number; usedQtl: number; priorityScore: number; noShowCount: number;
  createdLabel: string;
}
export interface Centre {
  id: string; code: string; name: string; district: string; lanes: number;
  weighbridgeQtlDay: number; gunnyBags: number; qtlPerBag: number; godownFreeQtl: number;
  active: boolean;
  /** today's centre-day, the row booking locks on */
  dayStatus: DayStatus; capacityQtl: number; bookedQtl: number; capacityTrolleys: number; bookedTrolleys: number;
}
export interface Booking {
  ref: string; farmerId: string; farmerName: string; mobile: string; centreId: string;
  date: string; slot: string; crop: string; qtl: number; trolleys: number;
  pool: "general" | "reserve" | "small_holder"; status: BookingStatus; via: string;
}
export interface QToken {
  seq: number; centreId: string; bookingRef: string; farmerName: string;
  vehicleNo: string | null; lane: number | null; window: string; served: boolean;
}
export interface Lot {
  receiptNo: string; bookingRef: string; farmerName: string; centreId: string; crop: string;
  variety: string; moisturePct: number; normPct: number; netQtl: number; ratePerQtl: number; amount: number;
  weighedLabel: string;
}
export interface Payment {
  receiptNo: string; farmerName: string; amount: number; status: PaymentStatus;
  utr: string | null; failureReason: string | null; initiatedLabel: string | null; hoursOutstanding: number | null;
}
export interface Message {
  id: string; farmerName: string; channel: "sms" | "ivr" | "push" | "in_app"; category: string;
  body: string; status: "queued" | "sent" | "delivered" | "failed"; createdLabel: string;
}
export interface Rate { crop: string; msp: number; modal: number; mandi: string; delta: number; }
export interface CentreEvent { id: string; centreId: string; date: string; kind: EventKind; note: string; createdLabel: string; }
export interface Grievance {
  ref: string; farmerName: string; category: string; body: string; status: GrievanceStatus; lotRef: string | null;
}
export interface AuditEntry { id: string; actor: string; action: string; entity: string; entityId: string; atLabel: string; }

export interface AdminState {
  admin: { name: string; mobile: string } | null;
  farmers: Farmer[]; centres: Centre[]; bookings: Booking[]; tokens: QToken[];
  nowServing: Record<string, number>; lots: Lot[]; payments: Payment[]; messages: Message[];
  rates: Rate[]; events: CentreEvent[]; grievances: Grievance[]; audit: AuditEntry[];
}

/* ------------------------------------------------------------------- seed */

export function seed(): AdminState {
  return {
    admin: null,
    farmers: [
      { id: "u1", name: "Harpreet Singh", mobile: "+919876543210", role: "farmer", district: "Ludhiana", village: "Nurpur", crop: "Wheat", entitlementQtl: 62, usedQtl: 31.2, priorityScore: 100, noShowCount: 0, createdLabel: "12 Aug" },
      { id: "u2", name: "Gurpreet Kaur", mobile: "+919812345678", role: "farmer", district: "Ludhiana", village: "Mullanpur", crop: "Wheat", entitlementQtl: 40, usedQtl: 0, priorityScore: 92, noShowCount: 1, createdLabel: "14 Aug" },
      { id: "u3", name: "Balwinder Sandhu", mobile: "+919888112233", role: "farmer", district: "Ludhiana", village: "Raikot", crop: "Paddy", entitlementQtl: 88, usedQtl: 22, priorityScore: 100, noShowCount: 0, createdLabel: "16 Aug" },
      { id: "u4", name: "Simran Dhillon", mobile: "+919933221100", role: "farmer", district: "Ludhiana", village: "Jagraon", crop: "Wheat", entitlementQtl: 15, usedQtl: 15, priorityScore: 100, noShowCount: 0, createdLabel: "18 Aug" },
      { id: "op1", name: "Jaswant (Jagraon gate)", mobile: "+919700000001", role: "operator", district: "Ludhiana", village: "—", crop: "—", entitlementQtl: 0, usedQtl: 0, priorityScore: 100, noShowCount: 0, createdLabel: "01 Aug" },
      { id: "dc1", name: "Ludhiana DFSC", mobile: "+919700000009", role: "district", district: "Ludhiana", village: "—", crop: "—", entitlementQtl: 0, usedQtl: 0, priorityScore: 100, noShowCount: 0, createdLabel: "01 Aug" },
    ],
    centres: [
      { id: "jagraon", code: "LDH-JGR", name: "Jagraon Procurement Centre", district: "Ludhiana", lanes: 3, weighbridgeQtlDay: 1200, gunnyBags: 3000, qtlPerBag: 0.5, godownFreeQtl: 1400, active: true, dayStatus: "open", capacityQtl: 1200, bookedQtl: 940, capacityTrolleys: 46, bookedTrolleys: 38 },
      { id: "mullanpur", code: "LDH-MUL", name: "Mullanpur Procurement Centre", district: "Ludhiana", lanes: 2, weighbridgeQtlDay: 800, gunnyBags: 2000, qtlPerBag: 0.5, godownFreeQtl: 600, active: true, dayStatus: "open", capacityQtl: 600, bookedQtl: 210, capacityTrolleys: 24, bookedTrolleys: 9 },
      { id: "raikot", code: "LDH-RKT", name: "Raikot Procurement Centre", district: "Ludhiana", lanes: 2, weighbridgeQtlDay: 900, gunnyBags: 2400, qtlPerBag: 0.5, godownFreeQtl: 1000, active: true, dayStatus: "paused", capacityQtl: 900, bookedQtl: 505, capacityTrolleys: 34, bookedTrolleys: 19 },
    ],
    bookings: [
      { ref: "KS-26-3F2A9C", farmerId: "u1", farmerName: "Harpreet Singh", mobile: "+919876543210", centreId: "jagraon", date: "2026-09-10", slot: "9:30–11:30", crop: "Wheat", qtl: 18, trolleys: 1, pool: "general", status: "checked_in", via: "app" },
      { ref: "KS-26-77B1E2", farmerId: "u2", farmerName: "Gurpreet Kaur", mobile: "+919812345678", centreId: "jagraon", date: "2026-09-10", slot: "10:00–12:00", crop: "Wheat", qtl: 12, trolleys: 1, pool: "small_holder", status: "booked", via: "sms" },
      { ref: "KS-26-91C0AA", farmerId: "u3", farmerName: "Balwinder Sandhu", mobile: "+919888112233", centreId: "raikot", date: "2026-09-10", slot: "8:00–10:00", crop: "Paddy", qtl: 22, trolleys: 2, pool: "general", status: "booked", via: "assisted" },
      { ref: "KS-26-04DD31", farmerId: "u4", farmerName: "Simran Dhillon", mobile: "+919933221100", centreId: "jagraon", date: "2026-09-09", slot: "2:00–4:00", crop: "Wheat", qtl: 15, trolleys: 1, pool: "general", status: "served", via: "app" },
      { ref: "KS-26-5A2C7D", farmerId: "u2", farmerName: "Gurpreet Kaur", mobile: "+919812345678", centreId: "mullanpur", date: "2026-09-08", slot: "12:00–2:00", crop: "Wheat", qtl: 10, trolleys: 1, pool: "general", status: "no_show", via: "app" },
    ],
    tokens: [
      { seq: 21, centreId: "jagraon", bookingRef: "KS-26-OLD21", farmerName: "Manjit S.", vehicleNo: "PB10 AB 1234", lane: 1, window: "8:00–10:00", served: true },
      { seq: 22, centreId: "jagraon", bookingRef: "KS-26-OLD22", farmerName: "Rajwant K.", vehicleNo: "PB10 CD 5678", lane: 2, window: "8:00–10:00", served: true },
      { seq: 23, centreId: "jagraon", bookingRef: "KS-26-3F2A9C", farmerName: "Harpreet Singh", vehicleNo: "PB10 EF 9012", lane: 3, window: "9:30–11:30", served: false },
      { seq: 24, centreId: "jagraon", bookingRef: "KS-26-OLD24", farmerName: "Sukhwinder S.", vehicleNo: null, lane: null, window: "10:00–12:00", served: false },
      { seq: 25, centreId: "jagraon", bookingRef: "KS-26-OLD25", farmerName: "Davinder K.", vehicleNo: null, lane: null, window: "10:00–12:00", served: false },
    ],
    nowServing: { jagraon: 22, mullanpur: 0, raikot: 0 },
    lots: [
      { receiptNo: "RCPT-260909-0412", bookingRef: "KS-26-04DD31", farmerName: "Simran Dhillon", centreId: "jagraon", crop: "Wheat", variety: "HD-2967", moisturePct: 11.2, normPct: 12, netQtl: 14.6, ratePerQtl: 2425, amount: 35405, weighedLabel: "9 Sep, 3:10 PM" },
      { receiptNo: "RCPT-260820-0724", bookingRef: "KS-26-OLD724", farmerName: "Harpreet Singh", centreId: "jagraon", crop: "Wheat", variety: "HD-2967", moisturePct: 10.8, normPct: 12, netQtl: 23.2, ratePerQtl: 2420, amount: 56144, weighedLabel: "20 Aug, 11:40 AM" },
      { receiptNo: "RCPT-260818-0441", bookingRef: "KS-26-OLD441", farmerName: "Harpreet Singh", centreId: "jagraon", crop: "Wheat", variety: "PBW-725", moisturePct: 13.4, normPct: 12, netQtl: 8, ratePerQtl: 2060, amount: 16480, weighedLabel: "18 Aug, 9:20 AM" },
    ],
    payments: [
      { receiptNo: "RCPT-260909-0412", farmerName: "Simran Dhillon", amount: 35405, status: "initiated", utr: null, failureReason: null, initiatedLabel: "9 Sep, 6:00 PM", hoursOutstanding: 15 },
      { receiptNo: "RCPT-260820-0724", farmerName: "Harpreet Singh", amount: 56144, status: "credited", utr: "SBIN0X4412093", failureReason: null, initiatedLabel: "20 Aug", hoursOutstanding: null },
      { receiptNo: "RCPT-260818-0441", farmerName: "Harpreet Singh", amount: 16480, status: "failed", utr: null, failureReason: "Account not linked to Aadhaar. Complete KYC at your bank branch.", initiatedLabel: "18 Aug", hoursOutstanding: 528 },
    ],
    messages: [
      { id: "m1", farmerName: "Harpreet Singh", channel: "sms", category: "PAYMENT", body: "भुगतान रुका — खाते से आधार लिंक नहीं. शाखा में KYC कराएँ. (PBW-725)", status: "delivered", createdLabel: "2h ago" },
      { id: "m2", farmerName: "Harpreet Singh", channel: "sms", category: "BOOKING", body: "ਪਰਚੀ ਪੱਕੀ — ਜਗਰਾਉਂ ਕੇਂਦਰ, 10 ਸਤੰਬਰ, 9:30–11:30. ਗੇਟ OTP 4417.", status: "delivered", createdLabel: "Yesterday" },
      { id: "m3", farmerName: "Gurpreet Kaur", channel: "ivr", category: "QUEUE", body: "ਤੁਹਾਡੀ ਵਾਰੀ ਨੇੜੇ ਹੈ — 5 ਗੱਡੀਆਂ ਬਾਕੀ. ਲੇਨ 3 ’ਤੇ ਪਹੁੰਚੋ.", status: "sent", createdLabel: "Yesterday" },
    ],
    rates: [
      { crop: "Wheat", msp: 2425, modal: 2440, mandi: "Khanna", delta: 15 },
      { crop: "Paddy", msp: 2300, modal: 2300, mandi: "Jagraon", delta: 0 },
      { crop: "Maize", msp: 2090, modal: 2095, mandi: "Khanna", delta: -12 },
    ],
    events: [
      { id: "e1", centreId: "raikot", date: "2026-09-10", kind: "godown_full", note: "Godown at capacity; awaiting lorry lift. Bookings paused.", createdLabel: "Today, 7:05 AM" },
    ],
    grievances: [
      { ref: "GRV-26-0007", farmerName: "Harpreet Singh", category: "payment", body: "Payment for PBW-725 held over a week, no reason given until now.", status: "open", lotRef: "RCPT-260818-0441" },
      { ref: "GRV-26-0006", farmerName: "Balwinder Sandhu", category: "slot", body: "Could not get a slot within entitlement window at Raikot.", status: "acknowledged", lotRef: null },
    ],
    audit: [
      { id: "a1", actor: "system", action: "centre_event.declared", entity: "centre", entityId: "raikot", atLabel: "Today, 7:05 AM" },
      { id: "a2", actor: "Jaswant (Jagraon gate)", action: "token.served", entity: "token", entityId: "22", atLabel: "Today, 8:52 AM" },
    ],
  };
}

/* ---------------------------------------------------------- pure mutations
   Each takes the state, applies the change, appends an audit row, and returns
   a short label for the toast. Pure over the passed state so data.selfcheck.ts
   can exercise them without a browser. */

const now = () => "Just now";
let auditSeq = 0;
function log(s: AdminState, action: string, entity: string, entityId: string) {
  s.audit.unshift({ id: "a" + Date.now() + "-" + auditSeq++, actor: s.admin?.name ?? "admin", action, entity, entityId, atLabel: now() });
}

export const mutate = {
  setRole(s: AdminState, farmerId: string, role: Role): string {
    const f = s.farmers.find((x) => x.id === farmerId);
    if (!f) throw new Error("Farmer not found");
    f.role = role;
    log(s, "user.role_changed", "user", farmerId);
    return `${f.name} is now ${role}.`;
  },

  setCentreActive(s: AdminState, centreId: string, active: boolean): string {
    const c = s.centres.find((x) => x.id === centreId);
    if (!c) throw new Error("Centre not found");
    c.active = active;
    log(s, active ? "centre.activated" : "centre.deactivated", "centre", centreId);
    return `${c.name} ${active ? "activated" : "deactivated"}.`;
  },

  setDayStatus(s: AdminState, centreId: string, status: DayStatus): string {
    const c = s.centres.find((x) => x.id === centreId);
    if (!c) throw new Error("Centre not found");
    c.dayStatus = status;
    log(s, "centre_day.status", "centre_day", centreId);
    return `${c.name} today is ${status}.`;
  },

  /** Cancelling returns the booked trolleys and quintals to the centre-day pool. */
  cancelBooking(s: AdminState, ref: string): string {
    const b = s.bookings.find((x) => x.ref === ref);
    if (!b) throw new Error("Booking not found");
    if (b.status === "cancelled") return "Already cancelled.";
    if (b.status === "served") throw new Error("A served booking cannot be cancelled.");
    const c = s.centres.find((x) => x.id === b.centreId);
    if (c) { c.bookedTrolleys = Math.max(0, c.bookedTrolleys - b.trolleys); c.bookedQtl = Math.max(0, c.bookedQtl - b.qtl); }
    b.status = "cancelled";
    log(s, "booking.cancelled", "booking", ref);
    return `${ref} cancelled; ${b.trolleys} trolley returned to ${c?.name ?? "the centre"}.`;
  },

  /** No-show docks the farmer's published priority score and frees the seat. */
  markNoShow(s: AdminState, ref: string): string {
    const b = s.bookings.find((x) => x.ref === ref);
    if (!b) throw new Error("Booking not found");
    if (b.status === "served") throw new Error("A served booking cannot be a no-show.");
    b.status = "no_show";
    const c = s.centres.find((x) => x.id === b.centreId);
    if (c) { c.bookedTrolleys = Math.max(0, c.bookedTrolleys - b.trolleys); c.bookedQtl = Math.max(0, c.bookedQtl - b.qtl); }
    const f = s.farmers.find((x) => x.id === b.farmerId);
    if (f) { f.noShowCount += 1; f.priorityScore = Math.max(0, f.priorityScore - 8); }
    log(s, "booking.no_show", "booking", ref);
    return `${b.farmerName} marked no-show; priority now ${f?.priorityScore ?? "?"}.`;
  },

  /** Serve the next unserved token at a centre — advances the live board. */
  serveNext(s: AdminState, centreId: string): string {
    const next = s.tokens
      .filter((tk) => tk.centreId === centreId && !tk.served)
      .sort((a, b) => a.seq - b.seq)[0];
    if (!next) throw new Error("No one waiting at this centre.");
    next.served = true;
    s.nowServing[centreId] = next.seq;
    log(s, "token.served", "token", String(next.seq));
    return `Now serving token ${String(next.seq).padStart(3, "0")} — ${next.farmerName}.`;
  },

  /** Retrying a held/failed payment credits it and stamps a UTR. */
  retryPayment(s: AdminState, receiptNo: string): string {
    const p = s.payments.find((x) => x.receiptNo === receiptNo);
    if (!p) throw new Error("Payment not found");
    if (p.status === "credited") return "Already credited.";
    p.status = "credited";
    p.utr = "SBIN0" + Math.random().toString().slice(2, 11);
    p.failureReason = null;
    p.hoursOutstanding = null;
    log(s, "payment.retried", "payment", receiptNo);
    return `${receiptNo} credited (UTR ${p.utr}).`;
  },

  declareEvent(s: AdminState, centreId: string, kind: EventKind, note: string): string {
    const c = s.centres.find((x) => x.id === centreId);
    if (!c) throw new Error("Centre not found");
    s.events.unshift({ id: "e" + Date.now(), centreId, date: "2026-09-10", kind, note: note || kind.replace("_", " "), createdLabel: now() });
    if (kind !== "holiday") c.dayStatus = "paused";
    log(s, "centre_event.declared", "centre", centreId);
    return `${kind.replace("_", " ")} declared at ${c.name}; bookings paused.`;
  },

  setGrievanceStatus(s: AdminState, ref: string, status: GrievanceStatus): string {
    const g = s.grievances.find((x) => x.ref === ref);
    if (!g) throw new Error("Grievance not found");
    g.status = status;
    log(s, "grievance." + status, "grievance", ref);
    return `${ref} ${status}.`;
  },
};

/* --------------------------------------------------------- overview KPIs */

export function overview(s: AdminState) {
  const active = s.bookings.filter((b) => b.status === "booked" || b.status === "checked_in");
  return {
    farmers: s.farmers.filter((f) => f.role === "farmer").length,
    centres: s.centres.length,
    centresOpen: s.centres.filter((c) => c.active && c.dayStatus === "open").length,
    bookingsToday: s.bookings.filter((b) => b.date === "2026-09-10").length,
    activeBookings: active.length,
    inQueue: s.tokens.filter((tk) => !tk.served).length,
    servedToday: s.tokens.filter((tk) => tk.served).length,
    procurementValue: s.lots.reduce((sum, l) => sum + l.amount, 0),
    capacityQtl: s.centres.reduce((sum, c) => sum + c.capacityQtl, 0),
    bookedQtl: s.centres.reduce((sum, c) => sum + c.bookedQtl, 0),
    paymentsHeld: s.payments.filter((p) => p.status === "failed" || p.status === "returned").length,
    paymentsOver48h: s.payments.filter((p) => p.status === "initiated" && (p.hoursOutstanding ?? 0) > 48).length,
    openGrievances: s.grievances.filter((g) => g.status === "open").length,
  };
}

/* ------------------------------------------------------------- the store
   localStorage-backed, like the farmer mock. Mutations run the pure helpers
   on the live state, persist, and bump a version so React re-renders. */

const KEY = "kq-admin-state-v1";
const TOKEN = "kq-admin-token";
const OTP = "kq-admin-otp";

function load(): AdminState {
  try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch { /* ignore */ }
  const s = seed(); persist(s); return s;
}
function persist(s: AdminState) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } }

let state = load();
let version = 0;
const listeners = new Set<() => void>();
function bump() { version++; listeners.forEach((fn) => fn()); }
const delay = (ms = 260) => new Promise((r) => setTimeout(r, ms));

export const adminStore = {
  subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); },
  getVersion() { return version; },
  get() { return state; },

  isAuthed() { try { return !!localStorage.getItem(TOKEN); } catch { return false; } },
  admin() { return state.admin; },

  async requestOtp(mobile: string) {
    await delay();
    const code = String(Math.floor(1000 + Math.random() * 9000));
    try { sessionStorage.setItem(OTP, code); } catch { /* ignore */ }
    console.info(`[KisanQ admin] OTP for ${mobile}: ${code}`);
    return { devCode: code, expiresInSec: 300 };
  },
  async verifyOtp(mobile: string, code: string): Promise<{ ok: true }> {
    await delay();
    let expected: string | null = null;
    try { expected = sessionStorage.getItem(OTP); } catch { /* ignore */ }
    if (code !== expected) { const e: any = new Error("That code was not right. Try again."); e.code = "OTP_WRONG"; throw e; }
    state.admin = { name: "District Admin", mobile };
    persist(state);
    try { localStorage.setItem(TOKEN, "mock-admin-session"); } catch { /* ignore */ }
    bump();
    return { ok: true };
  },
  logout() {
    state.admin = null; persist(state);
    try { localStorage.removeItem(TOKEN); } catch { /* ignore */ }
    bump();
  },

  /** Wrap a pure mutation: apply to live state, persist, notify. */
  run<Args extends unknown[]>(fn: (s: AdminState, ...a: Args) => string, ...args: Args): string {
    const msg = fn(state, ...args);
    persist(state); bump();
    return msg;
  },

  reset() { state = seed(); persist(state); bump(); },
};
