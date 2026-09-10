/**
 * Dev data layer. The farmer API (OTP, dashboard, booking, queue) lands at
 * backend levels L1–L4; until then this makes every Sunrise screen fully usable
 * and demoable, persisting to localStorage so bookings and queue movement stick.
 *
 * Every shape here matches src/api/types.ts, which matches the server schema —
 * so swapping to the real API is a client change, not a screen rewrite.
 */
import type {
  Dashboard, Centre, Slot, Procurement, Notification, Rates, Queue, Appointment, AssistAnswer,
} from "./types";
import type { Lang } from "../i18n/strings";

const KEY = "kq-mock-state-v2";
const OTP_KEY = "kq-mock-otp";

const CENTRES: Centre[] = [
  { id: "jagraon", name: "Jagraon Procurement Centre", location: "Jagraon, Ludhiana", district: "Ludhiana", distanceKm: 6 },
  { id: "mullanpur", name: "Mullanpur Procurement Centre", location: "Mullanpur, Ludhiana", district: "Ludhiana", distanceKm: 11 },
  { id: "raikot", name: "Raikot Procurement Centre", location: "Raikot, Ludhiana", district: "Ludhiana", distanceKm: 19 },
];

/**
 * Each centre runs its own windows, capacity and starting load — a big 3-lane
 * centre offers more slots and holds more trolleys than a quiet 2-lane one, so
 * switching centre genuinely changes the times and the quantity on offer.
 * `pool` marks a small-holder-reserved window. `booked` is the seed load; live
 * bookings add to it through state.slotBooked and reduce what's shown as left.
 */
interface SlotProfile { time: string; end: string; cap: number; booked: number; pool: Slot["pool"]; }
const CENTRE_SLOTS: Record<string, SlotProfile[]> = {
  jagraon: [
    { time: "8:00 AM", end: "10:00 AM", cap: 12, booked: 7, pool: "general" },
    { time: "10:00 AM", end: "12:00 PM", cap: 12, booked: 12, pool: "small_holder" },
    { time: "12:00 PM", end: "2:00 PM", cap: 10, booked: 4, pool: "general" },
    { time: "2:00 PM", end: "4:00 PM", cap: 10, booked: 6, pool: "general" },
    { time: "4:00 PM", end: "6:00 PM", cap: 8, booked: 2, pool: "general" },
  ],
  mullanpur: [
    { time: "9:00 AM", end: "11:00 AM", cap: 8, booked: 2, pool: "general" },
    { time: "11:00 AM", end: "1:00 PM", cap: 8, booked: 3, pool: "small_holder" },
    { time: "1:00 PM", end: "3:00 PM", cap: 6, booked: 1, pool: "general" },
    { time: "3:00 PM", end: "5:00 PM", cap: 6, booked: 0, pool: "general" },
  ],
  raikot: [
    { time: "8:30 AM", end: "10:30 AM", cap: 10, booked: 9, pool: "general" },
    { time: "10:30 AM", end: "12:30 PM", cap: 10, booked: 10, pool: "general" },
    { time: "12:30 PM", end: "2:30 PM", cap: 8, booked: 7, pool: "small_holder" },
  ],
};

interface MockState {
  authed: boolean;
  mobile: string;
  appointment: Appointment | null;
  queue: Queue | null;
  procurements: Procurement[];
  notifications: Notification[];
  entitlementQtl: number;
  usedQtl: number;
  /** Extra trolleys booked live, on top of each slot's seed load. Key: centreId|date|slotIndex. */
  slotBooked: Record<string, number>;
}

function seed(): MockState {
  return {
    authed: false,
    mobile: "",
    appointment: {
      ref: "KS-26-3F2A9C", centreId: "jagraon", centre: "Jagraon Procurement Centre",
      date: "2026-09-10", dateLabel: "Thursday, 10 September", day: "10", month: "Sep",
      weekday: "Thursday", slot: "9:30 AM", slotEnd: "11:30 AM", crop: "Wheat",
      qtl: 18, pool: "general", status: "booked", gateOtp: "4417",
    },
    queue: {
      seq: 41, nowServing: 23, farmersAhead: 18, queueSize: 46, lane: 3,
      estimatedWaitMinutes: 38, updatedAt: new Date().toISOString(),
    },
    procurements: [
      { id: "PRC-260820-724", crop: "Wheat", variety: "HD-2967", date: "20 Aug 2026", quantityQuintals: 23.2, amount: 48320, paymentStatus: "credited", paymentLabel: "Credited 22 Aug" },
      { id: "PRC-260818-441", crop: "Wheat", variety: "PBW-725", date: "18 Aug 2026", quantityQuintals: 8, amount: 16480, paymentStatus: "failed", paymentLabel: "Held — action needed", failureReason: "Account not linked to Aadhaar. Complete KYC at your bank branch." },
    ],
    notifications: [
      { id: "n1", category: "PAYMENT", channel: "SMS", body: "भुगतान रुका — खाते से आधार लिंक नहीं. शाखा में KYC कराएँ. (PBW-725)", createdLabel: "2h ago · SMS", read: false },
      { id: "n2", category: "BOOKING", channel: "SMS", body: "ਪਰਚੀ ਪੱਕੀ — ਜਗਰਾਉਂ ਕੇਂਦਰ, 10 ਸਤੰਬਰ, 9:30–11:30. ਗੇਟ OTP 4417.", createdLabel: "Yesterday · SMS", read: true },
      { id: "n3", category: "QUEUE", channel: "IVR", body: "ਤੁਹਾਡੀ ਵਾਰੀ ਨੇੜੇ ਹੈ — 5 ਗੱਡੀਆਂ ਬਾਕੀ. ਲੇਨ 3 ’ਤੇ ਪਹੁੰਚੋ.", createdLabel: "Yesterday · Missed-call", read: true },
    ],
    entitlementQtl: 62, usedQtl: 31.2,
    slotBooked: {},
  };
}

function load(): MockState {
  try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch { /* ignore */ }
  const s = seed(); save(s); return s;
}
function save(s: MockState) { localStorage.setItem(KEY, JSON.stringify(s)); }
const delay = (ms = 320) => new Promise((r) => setTimeout(r, ms));

const RATES: Record<string, Rates> = {
  Wheat: {
    crop: "Wheat", today: 2425, delta: 15,
    trend: [
      { day: "M", value: 2380 }, { day: "T", value: 2395 }, { day: "W", value: 2410 },
      { day: "T", value: 2400 }, { day: "F", value: 2415 }, { day: "S", value: 2410 }, { day: "S", value: 2425 },
    ],
    nearby: [
      { mandi: "Khanna", price: 2440 }, { mandi: "Jagraon", price: 2425 }, { mandi: "Raikot", price: 2415 },
    ],
    advice: "Khanna is ₹15 higher, but 34 km away. At today's rate the trip costs more than it earns for under 20 quintals.",
  },
  Paddy: {
    crop: "Paddy", today: 2300, delta: 0,
    trend: [
      { day: "M", value: 2290 }, { day: "T", value: 2300 }, { day: "W", value: 2300 },
      { day: "T", value: 2295 }, { day: "F", value: 2300 }, { day: "S", value: 2300 }, { day: "S", value: 2300 },
    ],
    nearby: [{ mandi: "Khanna", price: 2300 }, { mandi: "Jagraon", price: 2300 }, { mandi: "Raikot", price: 2290 }],
    advice: "Paddy is at MSP across every nearby mandi. Book at the closest centre — there is nothing to gain by travelling.",
  },
  Maize: {
    crop: "Maize", today: 2090, delta: -12,
    trend: [
      { day: "M", value: 2120 }, { day: "T", value: 2115 }, { day: "W", value: 2100 },
      { day: "T", value: 2105 }, { day: "F", value: 2095 }, { day: "S", value: 2100 }, { day: "S", value: 2090 },
    ],
    nearby: [{ mandi: "Khanna", price: 2095 }, { mandi: "Jagraon", price: 2090 }, { mandi: "Raikot", price: 2085 }],
    advice: "Maize has eased ₹12 this week. If you can store safely, holding a few days may recover the dip.",
  },
};

export const mock = {
  async requestOtp(mobile: string) {
    await delay();
    const code = String(Math.floor(1000 + Math.random() * 9000));
    sessionStorage.setItem(OTP_KEY, code);
    // In the real system this arrives by SMS; here we surface it for the demo.
    console.info(`[KisanQ] OTP for ${mobile}: ${code}`);
    return { requestId: "mock", devCode: code, expiresIn: 300 };
  },
  async verifyOtp(mobile: string, code: string) {
    await delay();
    const expected = sessionStorage.getItem(OTP_KEY);
    if (code !== expected) { const e: any = new Error("That code was not right. Try again."); e.code = "OTP_WRONG"; throw e; }
    const s = load(); s.authed = true; s.mobile = mobile; save(s);
    localStorage.setItem("kq-token", "mock-session");
    return { ok: true };
  },
  logout() { const s = load(); s.authed = false; save(s); localStorage.removeItem("kq-token"); },
  isAuthed() { return !!localStorage.getItem("kq-token"); },

  async dashboard(lang: Lang): Promise<Dashboard> {
    await delay();
    const s = load();
    const p = s.procurements.find((x) => x.paymentStatus !== "credited") ?? null;
    return {
      user: { id: "u1", mobile: s.mobile || "98765 43210", name: "Harpreet Singh", language: lang, role: "farmer", district: "Ludhiana", priorityScore: 100, noShowCount: 0 },
      holding: { village: "Nurpur", district: "Ludhiana", areaHa: 1.6, crop: "Wheat", entitlementQtl: s.entitlementQtl, usedQtl: s.usedQtl },
      appointment: s.appointment,
      queue: s.queue,
      procurementValue: s.procurements.reduce((sum, x) => sum + x.amount, 0),
      payment: p,
      unreadNotifications: s.notifications.filter((n) => !n.read).length,
    };
  },
  async centres(): Promise<Centre[]> { await delay(); return CENTRES; },
  async slots(centreId: string, date: string): Promise<Slot[]> {
    await delay();
    const s = load();
    const profiles = CENTRE_SLOTS[centreId] ?? CENTRE_SLOTS.jagraon;
    return profiles.map((p, i) => {
      const live = s.slotBooked[`${centreId}|${date}|${i}`] ?? 0;
      return {
        id: `${centreId}|${date}|${i}`,
        time: p.time, end: p.end,
        capacityTrolleys: p.cap,
        bookedTrolleys: Math.min(p.cap, p.booked + live),
        pool: p.pool,
      };
    });
  },
  async book(input: { centreId: string; date: string; slotId: string; slot: string; end: string; qtl: number }): Promise<Appointment> {
    await delay(520);
    const s = load();
    const centre = CENTRES.find((c) => c.id === input.centreId)!;

    // Consume the seat: this slot now holds one more trolley, so its remaining
    // capacity drops on the next read (and hits "full" when it reaches the cap).
    const key = input.slotId; // centreId|date|slotIndex
    s.slotBooked[key] = (s.slotBooked[key] ?? 0) + 1;
    // Consume the quantity against the land record so "quintals left" shrinks.
    s.usedQtl = Math.min(s.entitlementQtl, s.usedQtl + input.qtl);

    const d = new Date(input.date + "T12:00:00");
    const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-IN", o).format(d);
    const appt: Appointment = {
      ref: "KS-26-" + Math.random().toString(16).slice(2, 8).toUpperCase(),
      centreId: centre.id, centre: centre.name, date: input.date,
      dateLabel: fmt({ weekday: "long", day: "numeric", month: "long" }),
      day: fmt({ day: "2-digit" }), month: fmt({ month: "short" }), weekday: fmt({ weekday: "long" }),
      slot: input.slot, slotEnd: input.end, crop: "Wheat", qtl: input.qtl, pool: "general",
      status: "booked", gateOtp: String(Math.floor(1000 + Math.random() * 9000)),
    };
    s.appointment = appt;
    s.queue = { seq: 47, nowServing: 12, farmersAhead: 24, queueSize: 47, lane: null, estimatedWaitMinutes: 50, updatedAt: new Date().toISOString() };
    s.notifications.unshift({ id: "n" + Date.now(), category: "BOOKING", channel: "SMS", body: `ਪਰਚੀ ਪੱਕੀ — ${centre.name}, ${appt.dateLabel}, ${appt.slot}. ਗੇਟ OTP ${appt.gateOtp}.`, createdLabel: "Just now · SMS", read: false });
    save(s);
    return appt;
  },
  async advanceQueue(): Promise<Queue | null> {
    await delay(200);
    const s = load();
    if (s.queue && s.queue.farmersAhead > 0) {
      s.queue.farmersAhead -= 1;
      s.queue.nowServing += 1;
      s.queue.estimatedWaitMinutes = Math.max(2, s.queue.farmersAhead * 2 + 2);
      s.queue.updatedAt = new Date().toISOString();
      save(s);
    }
    return s.queue;
  },
  async notifyWhenNear(): Promise<{ ok: true }> {
    await delay();
    const s = load();
    s.notifications.unshift({ id: "n" + Date.now(), category: "QUEUE", channel: "IVR", body: "ਠੀਕ ਹੈ — 5 ਗੱਡੀਆਂ ਬਾਕੀ ਰਹਿਣ ’ਤੇ ਤੁਹਾਨੂੰ ਕਾਲ ਆਵੇਗੀ.", createdLabel: "Just now · IVR", read: false });
    save(s);
    return { ok: true };
  },
  async procurements(): Promise<Procurement[]> { await delay(); return load().procurements; },
  async notifications(): Promise<Notification[]> { await delay(); return load().notifications; },
  async markRead(id: string) { const s = load(); const n = s.notifications.find((x) => x.id === id); if (n) n.read = true; save(s); },
  async rates(crop: string): Promise<Rates> { await delay(); return RATES[crop] ?? RATES.Wheat; },

  async assist(text: string, lang: Lang): Promise<AssistAnswer> {
    await delay(600);
    const s = load();
    const lower = text.toLowerCase();
    const q = s.queue;
    const A = {
      turn: {
        pa: q ? `ਤੁਹਾਡੇ ਅੱਗੇ ${q.farmersAhead} ਗੱਡੀਆਂ ਹਨ। ਲਗਭਗ ${q.estimatedWaitMinutes} ਮਿੰਟ ਦੀ ਉਡੀਕ। ਲੇਨ ${q.lane ?? "—"}।` : "ਹਾਲੇ ਕੋਈ ਬੁਕਿੰਗ ਨਹੀਂ।",
        hi: q ? `आपके आगे ${q.farmersAhead} गाड़ियाँ हैं। लगभग ${q.estimatedWaitMinutes} मिनट प्रतीक्षा। लेन ${q.lane ?? "—"}।` : "अभी कोई बुकिंग नहीं।",
        en: q ? `${q.farmersAhead} vehicles are ahead of you — about ${q.estimatedWaitMinutes} minutes. Go to lane ${q.lane ?? "—"}.` : "You have no booking yet.",
      },
      money: {
        pa: "PBW-725 ਦਾ ₹16,480 ਰੁਕਿਆ ਹੈ — ਖਾਤਾ ਆਧਾਰ ਨਾਲ ਲਿੰਕ ਨਹੀਂ। ਸ਼ਾਖਾ ਵਿੱਚ KYC ਕਰਾਓ।",
        hi: "PBW-725 का ₹16,480 रुका है — खाता आधार से लिंक नहीं। शाखा में KYC कराएँ।",
        en: "₹16,480 for PBW-725 is held — your account is not linked to Aadhaar. Complete KYC at your bank branch.",
      },
      rate: {
        pa: "ਅੱਜ ਕਣਕ ₹2,425 ਪ੍ਰਤੀ ਕੁਇੰਟਲ, ₹15 ਵੱਧ।",
        hi: "आज गेहूँ ₹2,425 प्रति क्विंटल, ₹15 अधिक।",
        en: "Wheat is ₹2,425 per quintal today, up ₹15.",
      },
    };
    let intent: keyof typeof A = "turn";
    if (/money|paise|पैसे|ਪੈਸੇ|payment|भुगतान/.test(lower)) intent = "money";
    else if (/rate|bhaav|भाव|ਭਾਅ|price|wheat|गेहूँ|ਕਣਕ/.test(lower)) intent = "rate";
    else if (/turn|number|वारी|ਵਾਰੀ|बारी|queue|line/.test(lower)) intent = "turn";
    return { intent, answer: A[intent][lang], audioUrl: null };
  },
};
