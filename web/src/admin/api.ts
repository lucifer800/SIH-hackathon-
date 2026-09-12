/**
 * Real admin API client — wires the admin console mutations to the backend.
 * Auth is the same OTP as the farmer app; admin staff sign in with a mobile
 * number that has the "operator", "district", or "admin" role.
 */
import { adminStore } from "./data";

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api/v1";

const ACCESS = "kq-admin-access";
const REFRESH = "kq-admin-refresh";

const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };
const del = (k: string) => { try { localStorage.removeItem(k); } catch { /* ignore */ } };

let lastRequestId = "";

async function raw(path: string, opts: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.auth !== false) { const tok = get(ACCESS); if (tok) headers.Authorization = `Bearer ${tok}`; }
  return fetch(BASE + path, { method: opts.method ?? "GET", headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
}

async function req<T = any>(path: string, opts: Parameters<typeof raw>[1] = {}): Promise<T> {
  let res = await raw(path, opts);
  if (res.status === 401 && opts.auth !== false && get(REFRESH)) {
    const rt = get(REFRESH);
    if (rt) {
      const refreshRes = await raw("/auth/refresh", { method: "POST", body: { refreshToken: rt }, auth: false });
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        if (data.accessToken) { set(ACCESS, data.accessToken); set(REFRESH, data.refreshToken); res = await raw(path, opts); }
      }
    }
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message ?? "Something went wrong.");
  return data as T;
}

function signOutLocal() { del(ACCESS); del(REFRESH); }

/**
 * Admin API — mirrors the mutations from ./data.ts but calls the real backend.
 * Falls back to the mock for operations that don't have backend endpoints yet.
 */
export const adminApi = {
  isAuthed() { return !!get(ACCESS); },

  async requestOtp(mobile: string) {
    const r = await req<{ requestId: string; devCode?: string; expiresInSec: number }>("/auth/otp/request", { method: "POST", body: { mobile }, auth: false });
    lastRequestId = r.requestId;
    set("kq-admin-reqid", r.requestId);
    return { requestId: r.requestId, devCode: r.devCode ?? "", expiresIn: r.expiresInSec };
  },

  async verifyOtp(_mobile: string, code: string) {
    const requestId = lastRequestId || get("kq-admin-reqid") || "";
    const s = await req<{ accessToken: string; refreshToken: string }>("/auth/otp/verify", { method: "POST", body: { requestId, code }, auth: false });
    set(ACCESS, s.accessToken);
    set(REFRESH, s.refreshToken);
    return { ok: true as const };
  },

  logout() {
    const rt = get(REFRESH);
    if (rt) void raw("/auth/logout", { method: "POST", body: { refreshToken: rt }, auth: false });
    signOutLocal();
  },

  /* ---- Queue operations ---- */
  async serveNext(centreId: string, lane: number) {
    try {
      const r = await req<any>("/op/serve/next", { method: "POST", body: { centreId, lane } });
      return { ok: true, message: `Served token ${r.seq ?? "next"}` };
    } catch (e: any) {
      return { ok: false, message: e.message };
    }
  },

  /* ---- Payment operations ---- */
  async initiatePending(centreId?: string) {
    try {
      const r = await req<{ initiated: number }>("/payments/initiate", { method: "POST", body: { centreId } });
      return { ok: true, message: `Initiated ${r.initiated} payments` };
    } catch (e: any) {
      return { ok: false, message: e.message };
    }
  },

  /* ---- Operations not yet wired to backend — use mock for now ---- */
  cancelBooking(ref: string) {
    try {
      return { ok: true, message: adminStore.run((s: any) => (s as any).mutate.cancelBooking(s, ref)) };
    } catch (e: any) {
      return { ok: false, message: e.message };
    }
  },

  markNoShow(ref: string) {
    try {
      return { ok: true, message: adminStore.run((s: any) => (s as any).mutate.markNoShow(s, ref)) };
    } catch (e: any) {
      return { ok: false, message: e.message };
    }
  },

  setRole(farmerId: string, role: string) {
    try {
      return { ok: true, message: adminStore.run((s: any) => (s as any).mutate.setRole(s, farmerId, role)) };
    } catch (e: any) {
      return { ok: false, message: e.message };
    }
  },

  setCentreActive(centreId: string, active: boolean) {
    try {
      return { ok: true, message: adminStore.run((s: any) => (s as any).mutate.setCentreActive(s, centreId, active)) };
    } catch (e: any) {
      return { ok: false, message: e.message };
    }
  },

  setDayStatus(centreId: string, status: string) {
    try {
      return { ok: true, message: adminStore.run((s: any) => (s as any).mutate.setDayStatus(s, centreId, status)) };
    } catch (e: any) {
      return { ok: false, message: e.message };
    }
  },

  retryPayment(receiptNo: string) {
    try {
      return { ok: true, message: adminStore.run((s: any) => (s as any).mutate.retryPayment(s, receiptNo)) };
    } catch (e: any) {
      return { ok: false, message: e.message };
    }
  },

  declareEvent(centreId: string, kind: string, note: string) {
    try {
      return { ok: true, message: adminStore.run((s: any) => (s as any).mutate.declareEvent(s, centreId, kind, note)) };
    } catch (e: any) {
      return { ok: false, message: e.message };
    }
  },

  setGrievanceStatus(grievanceId: string, status: string) {
    try {
      return { ok: true, message: adminStore.run((s: any) => (s as any).mutate.setGrievanceStatus(s, grievanceId, status)) };
    } catch (e: any) {
      return { ok: false, message: e.message };
    }
  },
};
