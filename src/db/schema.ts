/**
 * KisanQ schema — the whole product, up front.
 *
 * Later levels add logic, not tables. The one table that matters most is
 * `centreDays`: every booking takes a row lock on it, which is what makes
 * slot capacity impossible to oversell.
 */
import {
  pgTable, pgEnum, uuid, text, integer, numeric, boolean,
  timestamp, date, jsonb, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ---------------------------------------------------------------- enums */

export const roleEnum = pgEnum("role", ["farmer", "assistant", "operator", "district", "admin"]);
export const langEnum = pgEnum("lang", ["pa", "hi", "en"]);
export type Lang = (typeof langEnum.enumValues)[number];
export type Role = (typeof roleEnum.enumValues)[number];

export const bookingStatusEnum = pgEnum("booking_status", [
  "booked", "checked_in", "served", "no_show", "cancelled", "rescheduled",
]);

/** Which capacity pool a booking drew from. Reserve and small-holder release at T-24h. */
export const poolEnum = pgEnum("pool", ["general", "reserve", "small_holder"]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending", "initiated", "credited", "failed", "returned",
]);

export const channelEnum = pgEnum("channel", ["sms", "ivr", "push", "in_app"]);
export const messageStatusEnum = pgEnum("message_status", [
  "queued", "sent", "delivered", "failed",
]);

export const centreEventKindEnum = pgEnum("centre_event_kind", [
  "rain", "godown_full", "bag_shortage", "weighbridge_down", "holiday",
]);

export const decisionKindEnum = pgEnum("decision_kind", [
  "reschedule_offer", "cancel_confirm",
]);

export const grievanceStatusEnum = pgEnum("grievance_status", [
  "open", "acknowledged", "resolved", "rejected",
]);

export const centreDayStatusEnum = pgEnum("centre_day_status", [
  "open", "paused", "closed",
]);

/* ---------------------------------------------------------------- people */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** E.164, normalised on write. The identity — there is no email login. */
  mobile: text("mobile").notNull(),
  name: text("name").notNull(),
  language: langEnum("language").notNull().default("pa"),
  role: roleEnum("role").notNull().default("farmer"),
  /** Opaque reference. Real eKYC is policy access we do not have. */
  aadhaarRef: text("aadhaar_ref"),
  /** Operators and district users are scoped to one centre / district. */
  centreId: uuid("centre_id"),
  district: text("district"),
  /**
   * Fairness score, 100 by default. Repeated no-shows lower it, which pushes the
   * farmer behind others competing for the same scarce slot. Published rule, not
   * a hidden algorithm — the deck commits to that.
   */
  priorityScore: integer("priority_score").notNull().default(100),
  noShowCount: integer("no_show_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("users_mobile_key").on(t.mobile),
  index("users_role_idx").on(t.role),
]);

export const holdings = pgTable("holdings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  village: text("village").notNull(),
  district: text("district").notNull(),
  areaHa: numeric("area_ha", { precision: 8, scale: 2 }).notNull(),
  crop: text("crop").notNull(),
  season: text("season").notNull(),
  /** Entitlement in quintals, derived from area × yield norm. */
  entitlementQtl: numeric("entitlement_qtl", { precision: 10, scale: 2 }).notNull(),
  usedQtl: numeric("used_qtl", { precision: 10, scale: 2 }).notNull().default("0"),
  lat: numeric("lat", { precision: 9, scale: 6 }),
  lng: numeric("lng", { precision: 9, scale: 6 }),
}, (t) => [
  index("holdings_user_idx").on(t.userId),
  uniqueIndex("holdings_user_crop_season_key").on(t.userId, t.crop, t.season),
]);

/* -------------------------------------------------------------- centres */

export const centres = pgTable("centres", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  district: text("district").notNull(),
  lat: numeric("lat", { precision: 9, scale: 6 }).notNull(),
  lng: numeric("lng", { precision: 9, scale: 6 }).notNull(),
  lanes: integer("lanes").notNull().default(2),
  /* --- the three capacity inputs from the deck --- */
  weighbridgeQtlDay: integer("weighbridge_qtl_day").notNull(),
  gunnyBags: integer("gunny_bags").notNull(),
  qtlPerBag: numeric("qtl_per_bag", { precision: 5, scale: 2 }).notNull().default("0.5"),
  godownFreeQtl: integer("godown_free_qtl").notNull(),
  active: boolean("active").notNull().default(true),
}, (t) => [
  uniqueIndex("centres_code_key").on(t.code),
  index("centres_district_idx").on(t.district),
]);

/**
 * One row per centre per day. THE LOCK ROW.
 * Booking does `SELECT ... FROM centre_days WHERE id = $1 FOR UPDATE`.
 */
export const centreDays = pgTable("centre_days", {
  id: uuid("id").primaryKey().defaultRandom(),
  centreId: uuid("centre_id").notNull().references(() => centres.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  /** min(weighbridge, bags × qtlPerBag, godown) frozen at generation time. */
  capacityQtl: integer("capacity_qtl").notNull(),
  capacityTrolleys: integer("capacity_trolleys").notNull(),
  bookedQtl: numeric("booked_qtl", { precision: 10, scale: 2 }).notNull().default("0"),
  bookedTrolleys: integer("booked_trolleys").notNull().default(0),
  reservePct: integer("reserve_pct").notNull().default(15),
  smallHolderPct: integer("small_holder_pct").notNull().default(30),
  poolsReleasedAt: timestamp("pools_released_at", { withTimezone: true }),
  status: centreDayStatusEnum("status").notNull().default("open"),
}, (t) => [
  uniqueIndex("centre_days_centre_date_key").on(t.centreId, t.date),
  index("centre_days_date_idx").on(t.date),
]);

/** Two-hour windows, per the deck. Counters denormalised for fast availability reads. */
export const slots = pgTable("slots", {
  id: uuid("id").primaryKey().defaultRandom(),
  centreDayId: uuid("centre_day_id").notNull().references(() => centreDays.id, { onDelete: "cascade" }),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
  capacityTrolleys: integer("capacity_trolleys").notNull(),
  capacityQtl: integer("capacity_qtl").notNull(),
  bookedTrolleys: integer("booked_trolleys").notNull().default(0),
  bookedQtl: numeric("booked_qtl", { precision: 10, scale: 2 }).notNull().default("0"),
}, (t) => [
  uniqueIndex("slots_day_start_key").on(t.centreDayId, t.windowStart),
  index("slots_window_idx").on(t.windowStart),
]);

/* ------------------------------------------------------------- bookings */

export const bookings = pgTable("bookings", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Human-facing: KS-26-3F2A9C. */
  ref: text("ref").notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  slotId: uuid("slot_id").notNull().references(() => slots.id),
  centreId: uuid("centre_id").notNull().references(() => centres.id),
  date: date("date").notNull(),
  crop: text("crop").notNull(),
  qtlDeclared: numeric("qtl_declared", { precision: 10, scale: 2 }).notNull(),
  trolleys: integer("trolleys").notNull().default(1),
  pool: poolEnum("pool").notNull().default("general"),
  status: bookingStatusEnum("status").notNull().default("booked"),
  /** argon2 hash. Plain text would make a token resellable — the deck's anti-proxy rule. */
  gateOtpHash: text("gate_otp_hash").notNull(),
  vehicleNo: text("vehicle_no"),
  supersededBy: uuid("superseded_by"),
  /** Set when a panchayat/CSC assistant booked on the farmer's behalf. */
  bookedByUserId: uuid("booked_by_user_id"),
  bookedVia: text("booked_via").notNull().default("app"), // app | sms | ivr | assisted
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  noShowAt: timestamp("no_show_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("bookings_ref_key").on(t.ref),
  index("bookings_user_idx").on(t.userId, t.status),
  index("bookings_slot_idx").on(t.slotId),
  index("bookings_centre_date_idx").on(t.centreId, t.date, t.status),
]);

/** Issued at the GATE, not at booking. That distinction is the whole queue design. */
export const tokens = pgTable("tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
  centreId: uuid("centre_id").notNull().references(() => centres.id),
  date: date("date").notNull(),
  seq: integer("seq").notNull(),
  lane: integer("lane"),
  /** Order key = (window_start, checked_in_at). Late goes to the back of its OWN window. */
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  checkedInAt: timestamp("checked_in_at", { withTimezone: true }).notNull().defaultNow(),
  servedAt: timestamp("served_at", { withTimezone: true }),
  /** Client UUID from the offline operator console — makes sync idempotent. */
  clientUuid: text("client_uuid"),
}, (t) => [
  uniqueIndex("tokens_centre_date_seq_key").on(t.centreId, t.date, t.seq),
  uniqueIndex("tokens_booking_key").on(t.bookingId),
  uniqueIndex("tokens_client_uuid_key").on(t.clientUuid),
  index("tokens_order_idx").on(t.centreId, t.date, t.windowStart, t.checkedInAt),
]);

/** The rolling mean that produces every ETA in the product comes from this table. */
export const serviceEvents = pgTable("service_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenId: uuid("token_id").notNull().references(() => tokens.id, { onDelete: "cascade" }),
  centreId: uuid("centre_id").notNull().references(() => centres.id),
  date: date("date").notNull(),
  lane: integer("lane").notNull(),
  operatorId: uuid("operator_id").references(() => users.id),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  durationSec: integer("duration_sec"),
}, (t) => [
  index("service_events_centre_date_idx").on(t.centreId, t.date, t.endedAt),
]);

/* --------------------------------------------------------- money & lots */

export const lots = pgTable("lots", {
  id: uuid("id").primaryKey().defaultRandom(),
  receiptNo: text("receipt_no").notNull(),
  bookingId: uuid("booking_id").notNull().references(() => bookings.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  centreId: uuid("centre_id").notNull().references(() => centres.id),
  crop: text("crop").notNull(),
  variety: text("variety"),
  moisturePct: numeric("moisture_pct", { precision: 5, scale: 2 }).notNull(),
  normPct: numeric("norm_pct", { precision: 5, scale: 2 }).notNull(),
  grossQtl: numeric("gross_qtl", { precision: 10, scale: 2 }).notNull(),
  tareQtl: numeric("tare_qtl", { precision: 10, scale: 2 }).notNull(),
  netQtl: numeric("net_qtl", { precision: 10, scale: 2 }).notNull(),
  ratePerQtl: numeric("rate_per_qtl", { precision: 10, scale: 2 }).notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  operatorId: uuid("operator_id").references(() => users.id),
  weighedAt: timestamp("weighed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("lots_receipt_key").on(t.receiptNo),
  uniqueIndex("lots_booking_key").on(t.bookingId),
  index("lots_user_idx").on(t.userId),
]);

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  lotId: uuid("lot_id").notNull().references(() => lots.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  status: paymentStatusEnum("status").notNull().default("pending"),
  initiatedAt: timestamp("initiated_at", { withTimezone: true }),
  creditedAt: timestamp("credited_at", { withTimezone: true }),
  utr: text("utr"),
  failureCode: text("failure_code"),
  /** Already translated to something the farmer can act on, in their language. */
  failureReason: text("failure_reason"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("payments_lot_key").on(t.lotId),
  index("payments_status_idx").on(t.status, t.initiatedAt),
]);

/* ----------------------------------------------------------- messaging */

/** Every outbound message. This table IS the alerts screen — "nothing is lost". */
export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  channel: channelEnum("channel").notNull().default("sms"),
  templateId: text("template_id").notNull(),
  language: langEnum("language").notNull(),
  category: text("category").notNull(),
  /** The rendered body actually sent, kept verbatim. */
  body: text("body").notNull(),
  status: messageStatusEnum("status").notNull().default("queued"),
  providerId: text("provider_id"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("messages_user_idx").on(t.userId, t.createdAt),
]);

/** Backs "reply 1 to accept a new slot" from a feature phone. */
export const pendingDecisions = pgTable("pending_decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: decisionKindEnum("kind").notNull(),
  payload: jsonb("payload").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: text("resolved_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("pending_decisions_user_idx").on(t.userId, t.resolvedAt),
]);

/* ------------------------------------------------------ rates & events */

export const rates = pgTable("rates", {
  id: uuid("id").primaryKey().defaultRandom(),
  crop: text("crop").notNull(),
  variety: text("variety"),
  mandi: text("mandi").notNull(),
  district: text("district").notNull(),
  date: date("date").notNull(),
  msp: numeric("msp", { precision: 10, scale: 2 }),
  modalPrice: numeric("modal_price", { precision: 10, scale: 2 }).notNull(),
  source: text("source").notNull().default("data.gov.in"),
}, (t) => [
  uniqueIndex("rates_key").on(t.crop, t.mandi, t.date),
  index("rates_crop_date_idx").on(t.crop, t.date),
]);

/** Rain, a full godown or a bag shortage — triggers automatic reschedule offers. */
export const centreEvents = pgTable("centre_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  centreId: uuid("centre_id").notNull().references(() => centres.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  kind: centreEventKindEnum("kind").notNull(),
  note: text("note"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("centre_events_centre_date_idx").on(t.centreId, t.date),
]);

/* ---------------------------------------------- idempotency & audit log */

/** Rural double-taps and offline replays both land here first. */
export const idempotencyKeys = pgTable("idempotency_keys", {
  key: text("key").primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  route: text("route").notNull(),
  requestHash: text("request_hash").notNull(),
  statusCode: integer("status_code"),
  response: jsonb("response"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true })
    .notNull()
    .default(sql`now() + interval '24 hours'`),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").references(() => users.id),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("audit_entity_idx").on(t.entity, t.entityId),
  index("audit_at_idx").on(t.at),
]);

/* --------------------------------------------------------- live queue */

/**
 * A farmer's request to be called when their turn is near — the "Ring my phone"
 * button. The serve-next watcher fires the SMS/IVR when tokensAhead crosses the
 * threshold, then stamps firedAt so it never rings twice.
 */
export const queueNotifies = pgTable("queue_notifies", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenId: uuid("token_id").notNull().references(() => tokens.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  centreId: uuid("centre_id").notNull().references(() => centres.id),
  date: date("date").notNull(),
  threshold: integer("threshold").notNull().default(5),
  channel: channelEnum("channel").notNull().default("sms"),
  firedAt: timestamp("fired_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("queue_notifies_token_key").on(t.tokenId),
  index("queue_notifies_centre_date_idx").on(t.centreId, t.date, t.firedAt),
]);

/* ------------------------------------------------- fairness mechanisms */

/**
 * A short-lived claim on released capacity.
 *
 * When rain or a full godown cancels a day, the freed slots are NOT thrown open —
 * the affected farmers get a 6-hour first refusal. This table is what makes that
 * promise enforceable rather than aspirational.
 */
export const slotHolds = pgTable("slot_holds", {
  id: uuid("id").primaryKey().defaultRandom(),
  slotId: uuid("slot_id").notNull().references(() => slots.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  trolleys: integer("trolleys").notNull().default(1),
  qtl: numeric("qtl", { precision: 10, scale: 2 }).notNull(),
  reason: text("reason").notNull(), // rain_reschedule | godown_full | bag_shortage
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("slot_holds_slot_idx").on(t.slotId, t.expiresAt),
  index("slot_holds_user_idx").on(t.userId, t.claimedAt),
]);

/** "Every grievance tied to a lot ID" — the deck's governance claim, made literal. */
export const grievances = pgTable("grievances", {
  id: uuid("id").primaryKey().defaultRandom(),
  ref: text("ref").notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lotId: uuid("lot_id").references(() => lots.id),
  bookingId: uuid("booking_id").references(() => bookings.id),
  category: text("category").notNull(), // weighment | payment | slot | quality | other
  body: text("body").notNull(),
  language: langEnum("language").notNull(),
  status: grievanceStatusEnum("status").notNull().default("open"),
  assignedTo: uuid("assigned_to").references(() => users.id),
  resolution: text("resolution"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("grievances_ref_key").on(t.ref),
  index("grievances_user_idx").on(t.userId, t.status),
  index("grievances_lot_idx").on(t.lotId),
]);

/* --------------------------------------------------------------- auth */

export const otpRequests = pgTable("otp_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  mobile: text("mobile").notNull(),
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("otp_mobile_idx").on(t.mobile, t.createdAt),
]);

export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  /** Reuse of any token in a family revokes the whole family. */
  familyId: uuid("family_id").notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("refresh_user_idx").on(t.userId),
  index("refresh_family_idx").on(t.familyId),
]);
