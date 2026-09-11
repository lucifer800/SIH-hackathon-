/**
 * Live backend client — the real /api/v1, same method surface the screens already
 * call on the mock. Phase 1 wires auth + the booking flow (login, dashboard,
 * centres, slots, book); the remaining reads still delegate to the mock until
 * later phases, so untouched screens keep working.
 *
 * Response mapping lives here on purpose: the screens keep their existing shapes
 * (api/types.ts), and this file translates the server's payloads into them.
 */
import { mock } from "./mock";
import type { Dashboard, Centre, Slot, Appointment, Queue, Procurement } from "./types";
import type { Lang } from "../i18n/strings";

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api/v1";

const ACCESS = "kq-access";
const REFRESH = "kq-refresh";
const TOKEN = "kq-token"; // isAuthed flag, kept for compatibility with RequireAuth
const STASH = "kq-gateotp"; // {ref,gateOtp} from the last booking — dashboard omits the OTP

const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };
const del = (k: string) => { try { localStorage.removeItem(k); } catch { /* ignore */ } };

let lastRequestId = "";

export class ApiError extends Error {
  constructor(message: string, readonly code?: string, readonly status?: number) { super(message); }
}

async function raw(path: string, opts: { method?: string; body?: unknown; idem?: string; auth?: boolean } = {}): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json", "Accept-Language": get("kq-lang") ?? "pa" };
  if (opts.auth !== false) { const tok = get(ACCESS); if (tok) headers.Authorization = `Bearer ${tok}`; }
  if (opts.idem) headers["Idempotency-Key"] = opts.idem;
  return fetch(BASE + path, { method: opts.method ?? "GET", headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
}

async function req<T = any>(path: string, opts: Parameters<typeof raw>[1] = {}): Promise<T> {
  let res = await raw(path, opts);
  if (res.status === 401 && opts.auth !== false && get(REFRESH)) {
    if (await refresh()) res = await raw(path, opts); // one retry after a successful rotate
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error?.message ?? "Something went wrong.", data?.error?.code, res.status);
  return data as T;
}

async function refresh(): Promise<boolean> {
  const rt = get(REFRESH);
  if (!rt) return false;
  const res = await raw("/auth/refresh", { method: "POST", body: { refreshToken: rt }, auth: false });
  if (!res.ok) { signOutLocal(); return false; }
  const data = await res.json().catch(() => ({}));
  if (data.accessToken) { set(ACCESS, data.accessToken); set(REFRESH, data.refreshToken); return true; }
  return false;
}

function signOutLocal() { del(ACCESS); del(REFRESH); del(TOKEN); }

/* ------------------------------------------------------------------ maps */

function toAppointment(b: any, gateOtp?: string): Appointment {
  const d = new Date((b.date ?? "") + "T12:00:00");
  const fmt = (o: Intl.DateTimeFormatOptions) => (Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("en-IN", o).format(d));
  return {
    ref: b.ref, centreId: b.centreId ?? "", centre: b.centre, date: b.date,
    dateLabel: b.dateLabel ?? fmt({ weekday: "long", day: "numeric", month: "long" }),
    day: fmt({ day: "2-digit" }), month: fmt({ month: "short" }), weekday: fmt({ weekday: "long" }),
    slot: b.slot, slotEnd: b.slotEnd ?? b.window?.split("–")?.[1]?.trim() ?? "", crop: b.crop,
    qtl: Number(b.qtl ?? 0), pool: b.pool ?? "general", status: b.status ?? "booked", gateOtp: gateOtp ?? "",
  };
}

function toQueue(q: any): Queue | null {
  if (!q) return null;
  return {
    seq: q.seq, nowServing: q.nowServing ?? 0, farmersAhead: q.farmersAhead,
    queueSize: q.queueSize, lane: q.lane ?? null, estimatedWaitMinutes: q.estimatedWaitMinutes,
    updatedAt: new Date().toISOString(),
  };
}

function toPayment(p: any): Procurement | null {
  if (!p) return null;
  const statusMap: Record<string, Procurement["paymentStatus"]> = { credited: "credited", failed: "failed", returned: "failed", pending: "processing", initiated: "processing" };
  return {
    id: p.receiptNo, crop: p.crop, variety: p.variety ?? "", date: p.initiatedAt ?? "",
    quantityQuintals: Number(p.netQtl ?? 0), amount: Number(p.amount ?? 0),
    paymentStatus: statusMap[p.status] ?? "processing", paymentDate: p.creditedAt ?? p.initiatedAt ?? undefined,
    failureReason: p.failureReason ? { pa: p.failureReason, hi: p.failureReason, en: p.failureReason } : undefined,
  };
}

/* --------------------------------------------------------------- client */

export const real = {
  ...mock, // procurements, notifications, rates, assist, queue helpers — until later phases

  isAuthed() { return !!get(ACCESS); },

  async requestOtp(mobile: string) {
    const r = await req<{ requestId: string; devCode?: string; expiresInSec: number }>("/auth/otp/request", { method: "POST", body: { mobile }, auth: false });
    lastRequestId = r.requestId;
    set("kq-reqid", r.requestId);
    return { requestId: r.requestId, devCode: r.devCode ?? "", expiresIn: r.expiresInSec };
  },

  async verifyOtp(_mobile: string, code: string) {
    const requestId = lastRequestId || get("kq-reqid") || "";
    const s = await req<{ accessToken: string; refreshToken: string; user: { language?: Lang } }>("/auth/otp/verify", { method: "POST", body: { requestId, code }, auth: false });
    set(ACCESS, s.accessToken); set(REFRESH, s.refreshToken); set(TOKEN, "1");
    if (s.user?.language) set("kq-lang", s.user.language);
    return { ok: true as const };
  },

  logout() {
    const rt = get(REFRESH);
    if (rt) void raw("/auth/logout", { method: "POST", body: { refreshToken: rt }, auth: false });
    signOutLocal();
  },

  async dashboard(_lang: Lang): Promise<Dashboard> {
    const d = await req<any>("/dashboard");
    const stash = (() => { try { return JSON.parse(get(STASH) ?? "null"); } catch { return null; } })();
    const gateOtp = stash && d.appointment && stash.ref === d.appointment.ref ? stash.gateOtp : undefined;
    return {
      user: { id: d.user?.id ?? "", mobile: d.user?.mobile ?? "", name: d.user?.name ?? "Farmer", language: d.user?.language ?? "pa", role: "farmer", district: d.user?.district ?? "", priorityScore: d.user?.priorityScore ?? 100, noShowCount: d.user?.noShowCount ?? 0 },
      holding: d.holding ?? { village: "", district: d.user?.district ?? "", areaHa: 0, crop: "Wheat", entitlementQtl: 0, usedQtl: 0 },
      appointment: d.appointment ? toAppointment(d.appointment, gateOtp) : null,
      queue: toQueue(d.queue),
      procurementValue: Number(d.procurementValue ?? 0),
      payment: toPayment(d.payment),
      unreadNotifications: Number(d.unreadNotifications ?? 0),
    };
  },

  async centres(): Promise<Centre[]> {
    const r = await req<{ centres: any[] }>("/centres");
    return r.centres.map((c) => ({ id: c.id, name: c.name, location: c.location, district: c.district, distanceKm: c.distanceKm != null ? Math.round(c.distanceKm) : 0 }));
  },

  async slots(centreId: string, date: string): Promise<Slot[]> {
    const r = await req<{ slots: any[] }>(`/centres/${centreId}/slots?date=${encodeURIComponent(date)}`);
    return r.slots.map((s) => ({
      id: s.id, time: s.time, end: s.end,
      capacityTrolleys: s.capacityTrolleys,
      // Show the farmer-eligible remaining as "booked" so the screen's cap−booked math matches,
      // and mark an unavailable window (paused day / no eligible pool) as full.
      bookedTrolleys: s.available ? s.capacityTrolleys - s.remainingTrolleys : s.capacityTrolleys,
      pool: s.pool,
    }));
  },

  async book(input: { centreId: string; date: string; slotId: string; slot: string; end: string; qtl: number }): Promise<Appointment> {
    const r = await req<{ booking: any; gateOtp?: string }>("/bookings", { method: "POST", idem: crypto.randomUUID(), body: { slotId: input.slotId, qtl: input.qtl, crop: "Wheat" } });
    if (r.gateOtp) set(STASH, JSON.stringify({ ref: r.booking.ref, gateOtp: r.gateOtp }));
    return toAppointment(r.booking, r.gateOtp);
  },

  /* ---- Alerts: the real message log. A sent SMS keeps the language it was sent in. ---- */
  async notifications() {
    const r = await req<{ messages: any[] }>("/messages");
    return r.messages.map((m) => ({
      id: m.id, category: m.category, channel: String(m.channel).toUpperCase(),
      body: { pa: m.body, hi: m.body, en: m.body }, createdAt: m.createdAt, read: m.read,
    }));
  },
  async markRead(id: string) { try { await req(`/messages/${id}/read`, { method: "POST" }); } catch { /* best-effort */ } },

  /* ---- Records: payments as procurement records ---- */
  async procurements(): Promise<Procurement[]> {
    const r = await req<{ payments: any[] }>("/payments");
    return r.payments.map((p) => toPayment(p)!).filter(Boolean);
  },

  /* ---- Rates: today's price, 7-day trend, nearby mandis. Advice is backend-built (one language for now). ---- */
  async rates(crop: string) {
    const r = await req<any>(`/rates?crop=${encodeURIComponent(crop)}`);
    const dayInitial = (d: string) => new Intl.DateTimeFormat("en", { weekday: "narrow" }).format(new Date(d + "T12:00:00"));
    return {
      crop: r.crop, today: r.today, delta: r.delta,
      trend: (r.trend ?? []).map((p: any) => ({ day: /^\d{4}-/.test(p.day) ? dayInitial(p.day) : p.day, value: p.value })),
      nearby: r.nearby ?? [],
      advice: { pa: r.advice, hi: r.advice, en: r.advice },
    };
  },

  /* ---- Queue: poll the live queue (null until the farmer checks in at the gate) ---- */
  async advanceQueue(): Promise<Queue | null> {
    const r = await req<{ queue: any }>("/queue/live");
    return toQueue(r.queue);
  },
  async notifyWhenNear() {
    await req("/queue/notify", { method: "POST", body: { threshold: 5, channel: "sms" } });
    return { ok: true as const };
  },

  /* ---- Voice: the assist intents ---- */
  async assist(text: string, lang: Lang) {
    const r = await req<{ intent: string; answer: string; audioUrl: string | null }>("/assist/ask", { method: "POST", body: { text, language: lang } });
    return { intent: r.intent as any, answer: r.answer, audioUrl: r.audioUrl };
  },
};
