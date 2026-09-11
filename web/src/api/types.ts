/** Mirrors the KisanQ API contract (src/db/schema.ts on the server). */
import type { Lang, L10n } from "../i18n/strings";

export interface User {
  id: string; mobile: string; name: string; language: Lang; role: string;
  district: string; priorityScore: number; noShowCount: number;
}
export interface Holding {
  village: string; district: string; areaHa: number; crop: string;
  entitlementQtl: number; usedQtl: number;
}
export interface Appointment {
  ref: string; centreId: string; centre: string; date: string; dateLabel: string;
  day: string; month: string; weekday: string; slot: string; slotEnd: string;
  crop: string; qtl: number; pool: string; status: string; gateOtp: string;
}
export interface Queue {
  seq: number; nowServing: number; farmersAhead: number; queueSize: number;
  lane: number | null; estimatedWaitMinutes: number; updatedAt: string;
}
export interface Centre {
  id: string; name: string; location: string; district: string; distanceKm: number;
}
export interface Slot {
  id: string; time: string; end: string; capacityTrolleys: number;
  bookedTrolleys: number; pool: "general" | "reserve" | "small_holder";
}
export interface Procurement {
  id: string; crop: string; variety: string; date: string; quantityQuintals: number;
  amount: number; paymentStatus: "credited" | "processing" | "failed";
  /** ISO date the status refers to (credited on / expected by); UI builds the label per language. */
  paymentDate?: string; failureReason?: L10n;
}
export interface Notification {
  /** A code from the mock (PAYMENT/BOOKING/QUEUE) or an already-localized label from the backend. */
  id: string; category: string; channel: string;
  /** Mock authors all three languages (follows the toggle); a real sent SMS carries its one language in all three slots. */
  body: L10n; createdAt: string; read: boolean;
}
export interface RatePoint { day: string; value: number; }
export interface Rates {
  crop: string; today: number; delta: number; trend: RatePoint[];
  nearby: { mandi: string; price: number }[]; advice: L10n;
}
export interface Dashboard {
  user: User; holding: Holding; appointment: Appointment | null; queue: Queue | null;
  procurementValue: number; payment: Procurement | null; unreadNotifications: number;
}

/* ---------------------------------------------------------------- L1 auth */

/** POST /api/v1/auth/otp/request — body. Send the bare 10 digits; the server normalises. */
export interface OtpRequestBody { mobile: string; }

export interface OtpRequestResponse {
  requestId: string;
  expiresInSec: number;      // 300
  resendAfterSec: number;    // 30 — gate the "resend" button on this
  /** Present only outside production, so the demo works without a handset. */
  devCode?: string;
}

/** POST /api/v1/auth/otp/verify — body. `language` is the toggle on the sign-in screen. */
export interface OtpVerifyBody {
  requestId: string;
  code: string;              // exactly 4 digits
  language?: Lang;
  name?: string;
}

export interface Session {
  accessToken: string;       // 15 min — keep in memory, never localStorage
  refreshToken: string;      // 60 days — "familyId.secret"
  expiresInSec: number;
  user: User;
  isNewUser: boolean;        // 201 on first sign-in, 200 after
}

export interface Me { user: User; holding: Holding | null; }

/**
 * Every error has this shape. Switch on `code`, show `message` — it is already
 * in the farmer's language where the server knows it.
 *
 * Codes the sign-in screen must handle:
 *   MOBILE_INVALID     422  not a 10-digit Indian mobile
 *   VALIDATION_FAILED  422  code was not 4 digits
 *   UNAUTHORIZED       401  wrong / expired / already-used code; message counts down tries
 *   RATE_LIMITED       429  three codes in an hour — offer assisted booking
 */
export interface ApiError {
  error: { code: string; message: string; details?: unknown };
  requestId: string;
}

/**
 * On any 401 from a data route: rotate once via POST /auth/refresh and retry.
 * If the refresh ALSO 401s, the session family was revoked — send the farmer
 * back to sign-in. Never retry a refresh twice; a replayed token is what
 * revokes the family in the first place.
 */
export const AUTH_ROUTES = {
  otpRequest: "/api/v1/auth/otp/request",
  otpVerify: "/api/v1/auth/otp/verify",
  refresh: "/api/v1/auth/refresh",
  logout: "/api/v1/auth/logout",
  me: "/api/v1/me",
} as const;

/* -------------------------------------------------------------- L2 booking */

export interface CentreListItem {
  id: string; name: string; location: string; district: string;
  lanes: number; distanceKm: number | null;   // null until the holding has coordinates
}

export interface DayAvailability {
  date: string; capacityTrolleys: number; bookedTrolleys: number;
  remainingTrolleys: number; status: "open" | "paused" | "closed";
}

/** GET /centres/:id/slots?date= — remaining is from THIS farmer's eligible pools,
 *  so the screen never offers a seat the engine will refuse. */
export interface SlotAvailability {
  id: string; time: string; end: string;
  capacityTrolleys: number; bookedTrolleys: number; remainingTrolleys: number;
  available: boolean; pool: "general" | "reserve" | "small_holder";
}

/** POST /bookings — REQUIRES an `Idempotency-Key` header. Repeat the same key to
 *  replay (double-tap safe); a new booking needs a new key. */
export interface BookBody { slotId: string; qtl: number; crop?: string; trolleys?: number; }

export interface BookingConfirmation {
  booking: {
    ref: string; centreId: string; centre: string; date: string; dateLabel: string;
    window: string; slot: string; slotEnd: string; crop: string; qtl: number;
    pool: string; status: string;
  };
  gateOtp?: string;   // dev only; production delivers it by SMS
}

/**
 * Booking error codes screen 04 must handle:
 *   ENTITLEMENT_EXCEEDED    422  wants more than the land record allows (details.remainingQtl)
 *   SLOT_FULL               409  this window is full for this farmer's pools
 *   INVALID_QUANTITY        422  qtl / trolleys <= 0
 *   IDEMPOTENCY_KEY_REQUIRED 400 no key sent
 *   IDEMPOTENCY_KEY_REUSED  422  same key, different booking body
 *   CENTRE_CLOSED           409  day not open
 */
export const BOOKING_ROUTES = {
  centres: "/api/v1/centres",
  days: (id: string) => `/api/v1/centres/${id}/days`,
  slots: (id: string) => `/api/v1/centres/${id}/slots`,
  book: "/api/v1/bookings",
  list: "/api/v1/bookings",
  reschedule: (ref: string) => `/api/v1/bookings/${ref}/reschedule`,
  cancel: (ref: string) => `/api/v1/bookings/${ref}/cancel`,
} as const;

/* --------------------------------------------------------------- L3 queue */

/** POST /op/checkin (operator) — the gate. Idempotent on clientUuid for offline replay. */
export interface CheckinBody {
  bookingRef: string; gateOtp: string; vehicleNo: string; lane?: number; clientUuid?: string;
}
export interface TokenView {
  tokenNumber: string; seq: number; bookingRef: string;
  vehicleNo: string | null; windowStart: string; lane: number | null; checkedInAt: string;
}

/** POST /op/serve/next (operator) — bring the next trolley. */
export interface ServeBody { centreId: string; lane: number; date?: string; }
export interface ServeResult {
  finished: number | null; nowServing: number | null;
  board: BoardSnapshot;
}

/** GET /queue/live and the /queue/stream SSE payload. `queue` is null when not in a line. */
export interface LiveQueue {
  centreId?: string; date?: string;
  queue: {
    seq: number; farmersAhead: number; queueSize: number;
    nowServing: number | null; estimatedWaitMinutes: number; served: boolean;
  } | null;
}

/** The mandi-gate big screen (Sunrise 08). Unauthenticated. */
export interface BoardSnapshot {
  nowServing: number | null; nextUp: number[]; inLine: number; servedToday: number;
}

/** POST /queue/notify — "Ring my phone". */
export interface NotifyBody { threshold?: number; channel?: "sms" | "ivr"; }

/**
 * SSE note: EventSource cannot send an Authorization header, so the farmer stream
 * takes the access token as a query param: `/queue/stream?token=<accessToken>`.
 * The board stream needs no auth. Both reconnect on their own (retry: 3000).
 * Fall back to polling /queue/live every ~10s only if EventSource is unavailable.
 */
export const QUEUE_ROUTES = {
  checkin: "/api/v1/op/checkin",
  serveNext: "/api/v1/op/serve/next",
  live: "/api/v1/queue/live",
  stream: (accessToken: string) => `/api/v1/queue/stream?token=${encodeURIComponent(accessToken)}`,
  notify: "/api/v1/queue/notify",
  board: (centreId: string) => `/api/v1/public/board/${centreId}`,
  boardStream: (centreId: string) => `/api/v1/public/board/${centreId}/stream`,
  ledger: (centreId: string) => `/api/v1/public/board/${centreId}/ledger`,
} as const;

/* --------------------------------------------------------------- L4 money */

/** POST /op/lots (operator) — the weighment → immutable receipt. */
export interface LotBody {
  bookingRef: string; moisturePct: number; grossQtl: number; tareQtl: number;
  variety?: string; ratePerQtl?: number; normPct?: number;
}
export interface LotView {
  receiptNo: string; bookingRef: string; crop: string; variety: string | null;
  moisturePct: number; normPct: number; moistureOverNorm: boolean;
  grossQtl: number; tareQtl: number; netQtl: number; ratePerQtl: number; amount: number;
  weighedAt: string; payment: { status: string; failureReason: string | null };
}

/** GET /payments — the tracker. `active` is the one to watch; null when all settled/credited. */
export interface PaymentItem {
  receiptNo: string; crop: string; variety: string | null; netQtl: number; amount: number;
  status: "pending" | "initiated" | "credited" | "failed" | "returned";
  utr: string | null; failureReason: string | null;
  initiatedAt: string | null; creditedAt: string | null; hoursOutstanding: number | null;
}
export interface PaymentTracker { active: PaymentItem | null; payments: PaymentItem[]; }

/** GET /messages — the alerts & SMS log (Sunrise 06). Newest first; unread render dark. */
export interface MessageItem {
  id: string; category: string; channel: "sms" | "ivr" | "push" | "in_app";
  body: string; createdAt: string; read: boolean;
}
export interface MessageLog { unread: number; messages: MessageItem[]; }

/** POST /hooks/bank/return-file (district/admin) — reconciliation input. */
export interface BankReturnRow {
  receiptNo: string; status: "credited" | "failed" | "returned"; bankCode?: string; utr?: string;
}

export const MONEY_ROUTES = {
  recordLot: "/api/v1/op/lots",
  lots: "/api/v1/lots",
  receipt: (receiptNo: string) => `/api/v1/lots/${receiptNo}/receipt`,
  payments: "/api/v1/payments",
  initiate: "/api/v1/payments/initiate",
  returnFile: "/api/v1/hooks/bank/return-file",
  messages: "/api/v1/messages",
  markRead: (id: string) => `/api/v1/messages/${id}/read`,
} as const;

/* ---------------------------------------------------------------- L5 reach */

/** GET /rates?crop=&mandi= — Sunrise 05. `trend` is oldest→newest for the bar chart. */
export interface RateView {
  crop: string; today: number; msp: number; delta: number;
  trend: { day: string; value: number }[];
  nearby: { mandi: string; price: number }[];
  advice: string;
}

/** POST /assist/ask — voice assist (Sunrise 07). audioUrl is null until Bhashini TTS is wired. */
export interface AssistBody { text: string; language?: Lang; }
export interface AssistAnswer { intent: "turn" | "money" | "rate" | "unknown"; answer: string; audioUrl: string | null; }

/** POST /op/events (operator) — declare a disruption. */
export interface CentreEventBody {
  centreId: string; date: string;
  kind: "rain" | "godown_full" | "bag_shortage" | "weighbridge_down" | "holiday"; note?: string;
}

/** GET /reschedule/offers — the farmer's open offers; accept via POST /reschedule/accept or SMS "1". */
export interface RescheduleOffer {
  id: string; originalRef: string; slotId: string; date: string; window: string;
  qtl: number; crop: string; expiresAt: string;
}

/** GET /district/:district/overview (district/admin). */
export interface DistrictOverview {
  district: string; date: string;
  centres: { centreId: string; name: string; capacityQtl: number; bookedQtl: number; bookedTrolleys: number; arrivals: number; served: number; utilisationPct: number; status: string }[];
  totals: { capacityQtl: number; bookedQtl: number; arrivals: number; served: number };
  payments: { initiated: number; over48h: number; failed: number; credited: number };
}

export const REACH_ROUTES = {
  rates: "/api/v1/rates",
  assist: "/api/v1/assist/ask",
  declareEvent: "/api/v1/op/events",
  offers: "/api/v1/reschedule/offers",
  acceptOffer: "/api/v1/reschedule/accept",
  smsInbound: "/api/v1/hooks/sms/inbound",     // provider webhook
  ivr: "/api/v1/hooks/ivr",                    // provider webhook
  districtOverview: (d: string) => `/api/v1/district/${encodeURIComponent(d)}/overview`,
  districtForecast: (d: string) => `/api/v1/district/${encodeURIComponent(d)}/forecast`,
} as const;

/* ------------------------------------------------------- L6 offline sync */

/** GET /op/centre/:id/day/:date — everything the console caches to run offline. */
export interface DayPack {
  centre: { id: string; name: string; lanes: number };
  date: string;
  day: { capacityQtl: number; capacityTrolleys: number; bookedTrolleys: number; status: string } | null;
  bookings: { ref: string; crop: string; qtl: number; trolleys: number; status: string }[];
  tokens: { seq: number; bookingId: string; lane: number | null; servedAt: string | null }[];
  syncedAt: string;
}

/**
 * POST /op/sync — replay the offline outbox. Each op carries a `clientUuid`; the
 * whole batch can be replayed safely (dropped-response case). `at` is the real
 * gate time (ISO) so token order stays centre-local, not sync-ordered.
 */
export type SyncOp =
  | { clientUuid: string; type: "checkin"; bookingRef: string; gateOtp: string; vehicleNo: string; lane?: number; at?: string }
  | { clientUuid: string; type: "serve_next"; lane: number; at?: string }
  | { clientUuid: string; type: "lot"; bookingRef: string; moisturePct: number; grossQtl: number; tareQtl: number; variety?: string };

export interface SyncBody { centreId: string; date?: string; operations: SyncOp[]; }
export interface SyncOpResult {
  clientUuid: string; type: string; ok: boolean; replayed?: boolean;
  result?: unknown; error?: { code: string; message: string };
}
export interface SyncResult { centreId: string; date: string; results: SyncOpResult[]; }

export const SYNC_ROUTES = {
  dayPack: (centreId: string, date: string) => `/api/v1/op/centre/${centreId}/day/${date}`,
  sync: "/api/v1/op/sync",
} as const;

/* ---------------------------------------------------- L7 trust & ops */

/** POST /grievances — tie a complaint to your own receipt or booking. */
export interface GrievanceBody { category: "weighment" | "payment" | "slot" | "quality" | "other"; body: string; receiptNo?: string; bookingRef?: string; }
export interface GrievanceView {
  ref: string; category: string; body: string;
  status: "open" | "acknowledged" | "resolved" | "rejected";
  lotId: string | null; bookingId: string | null; resolution: string | null;
  createdAt: string; resolvedAt: string | null;
}

/** GET /district/:d/impact — slide 5's four numbers, measured vs target. */
export interface ImpactReport {
  district: string;
  targets: { medianWaitMinutes: number; peakToAverage: number; failureSurfacedHours: number; dbtPromiseHours: number };
  measured: {
    medianWaitMinutes: number | null; sampleServed: number;
    peakToAverage: number | null; paymentFailuresSurfacedIn24hPct: number | null; knewTheirTurnPct: number;
  } | null;
}

/** GET /dashboard — the farmer home screen (Sunrise 02), one call. */
export interface DashboardResponse {
  user: { id: string; name: string; mobile: string; language: Lang; district: string; priorityScore: number; noShowCount: number } | null;
  holding: Holding | null;
  appointment: { ref: string; centre: string; date: string; dateLabel: string; slot: string; slotEnd: string; crop: string; qtl: number; pool: string; status: string } | null;
  queue: { seq: number; farmersAhead: number; queueSize: number; nowServing: number | null; estimatedWaitMinutes: number; served: boolean } | null;
  procurementValue: number;
  payment: PaymentItem | null;
  unreadNotifications: number;
}

export const TRUST_ROUTES = {
  fileGrievance: "/api/v1/grievances",
  myGrievances: "/api/v1/grievances",
  districtGrievances: "/api/v1/district/grievances",
  resolveGrievance: (ref: string) => `/api/v1/district/grievances/${ref}/resolve`,
  impact: (d: string) => `/api/v1/district/${encodeURIComponent(d)}/impact`,
  dashboard: "/api/v1/dashboard",
  sweep: "/api/v1/op/sweep",
} as const;
