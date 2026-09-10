CREATE TYPE "public"."booking_status" AS ENUM('booked', 'checked_in', 'served', 'no_show', 'cancelled', 'rescheduled');--> statement-breakpoint
CREATE TYPE "public"."centre_day_status" AS ENUM('open', 'paused', 'closed');--> statement-breakpoint
CREATE TYPE "public"."centre_event_kind" AS ENUM('rain', 'godown_full', 'bag_shortage', 'weighbridge_down', 'holiday');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('sms', 'ivr', 'push', 'in_app');--> statement-breakpoint
CREATE TYPE "public"."decision_kind" AS ENUM('reschedule_offer', 'cancel_confirm');--> statement-breakpoint
CREATE TYPE "public"."lang" AS ENUM('pa', 'hi', 'en');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('queued', 'sent', 'delivered', 'failed');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'initiated', 'credited', 'failed', 'returned');--> statement-breakpoint
CREATE TYPE "public"."pool" AS ENUM('general', 'reserve', 'small_holder');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('farmer', 'operator', 'district', 'admin');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref" text NOT NULL,
	"user_id" uuid NOT NULL,
	"slot_id" uuid NOT NULL,
	"centre_id" uuid NOT NULL,
	"date" date NOT NULL,
	"crop" text NOT NULL,
	"qtl_declared" numeric(10, 2) NOT NULL,
	"trolleys" integer DEFAULT 1 NOT NULL,
	"pool" "pool" DEFAULT 'general' NOT NULL,
	"status" "booking_status" DEFAULT 'booked' NOT NULL,
	"gate_otp_hash" text NOT NULL,
	"vehicle_no" text,
	"superseded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "centre_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"centre_id" uuid NOT NULL,
	"date" date NOT NULL,
	"capacity_qtl" integer NOT NULL,
	"capacity_trolleys" integer NOT NULL,
	"booked_qtl" numeric(10, 2) DEFAULT '0' NOT NULL,
	"booked_trolleys" integer DEFAULT 0 NOT NULL,
	"reserve_pct" integer DEFAULT 15 NOT NULL,
	"small_holder_pct" integer DEFAULT 30 NOT NULL,
	"pools_released_at" timestamp with time zone,
	"status" "centre_day_status" DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "centre_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"centre_id" uuid NOT NULL,
	"date" date NOT NULL,
	"kind" "centre_event_kind" NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "centres" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"district" text NOT NULL,
	"lat" numeric(9, 6) NOT NULL,
	"lng" numeric(9, 6) NOT NULL,
	"lanes" integer DEFAULT 2 NOT NULL,
	"weighbridge_qtl_day" integer NOT NULL,
	"gunny_bags" integer NOT NULL,
	"qtl_per_bag" numeric(5, 2) DEFAULT '0.5' NOT NULL,
	"godown_free_qtl" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holdings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"village" text NOT NULL,
	"district" text NOT NULL,
	"area_ha" numeric(8, 2) NOT NULL,
	"crop" text NOT NULL,
	"season" text NOT NULL,
	"entitlement_qtl" numeric(10, 2) NOT NULL,
	"used_qtl" numeric(10, 2) DEFAULT '0' NOT NULL,
	"lat" numeric(9, 6),
	"lng" numeric(9, 6)
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"route" text NOT NULL,
	"request_hash" text NOT NULL,
	"status_code" integer,
	"response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '24 hours' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_no" text NOT NULL,
	"booking_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"centre_id" uuid NOT NULL,
	"crop" text NOT NULL,
	"variety" text,
	"moisture_pct" numeric(5, 2) NOT NULL,
	"norm_pct" numeric(5, 2) NOT NULL,
	"gross_qtl" numeric(10, 2) NOT NULL,
	"tare_qtl" numeric(10, 2) NOT NULL,
	"net_qtl" numeric(10, 2) NOT NULL,
	"rate_per_qtl" numeric(10, 2) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"operator_id" uuid,
	"weighed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" "channel" DEFAULT 'sms' NOT NULL,
	"template_id" text NOT NULL,
	"language" "lang" NOT NULL,
	"category" text NOT NULL,
	"body" text NOT NULL,
	"status" "message_status" DEFAULT 'queued' NOT NULL,
	"provider_id" text,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mobile" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lot_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"initiated_at" timestamp with time zone,
	"credited_at" timestamp with time zone,
	"utr" text,
	"failure_code" text,
	"failure_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "decision_kind" NOT NULL,
	"payload" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crop" text NOT NULL,
	"variety" text,
	"mandi" text NOT NULL,
	"district" text NOT NULL,
	"date" date NOT NULL,
	"msp" numeric(10, 2),
	"modal_price" numeric(10, 2) NOT NULL,
	"source" text DEFAULT 'data.gov.in' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"family_id" uuid NOT NULL,
	"revoked_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" uuid NOT NULL,
	"centre_id" uuid NOT NULL,
	"date" date NOT NULL,
	"lane" integer NOT NULL,
	"operator_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_sec" integer
);
--> statement-breakpoint
CREATE TABLE "slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"centre_day_id" uuid NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"capacity_trolleys" integer NOT NULL,
	"capacity_qtl" integer NOT NULL,
	"booked_trolleys" integer DEFAULT 0 NOT NULL,
	"booked_qtl" numeric(10, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"centre_id" uuid NOT NULL,
	"date" date NOT NULL,
	"seq" integer NOT NULL,
	"lane" integer,
	"window_start" timestamp with time zone NOT NULL,
	"checked_in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"served_at" timestamp with time zone,
	"client_uuid" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mobile" text NOT NULL,
	"name" text NOT NULL,
	"language" "lang" DEFAULT 'pa' NOT NULL,
	"role" "role" DEFAULT 'farmer' NOT NULL,
	"aadhaar_ref" text,
	"centre_id" uuid,
	"district" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_slot_id_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."slots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_centre_id_centres_id_fk" FOREIGN KEY ("centre_id") REFERENCES "public"."centres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centre_days" ADD CONSTRAINT "centre_days_centre_id_centres_id_fk" FOREIGN KEY ("centre_id") REFERENCES "public"."centres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centre_events" ADD CONSTRAINT "centre_events_centre_id_centres_id_fk" FOREIGN KEY ("centre_id") REFERENCES "public"."centres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centre_events" ADD CONSTRAINT "centre_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_centre_id_centres_id_fk" FOREIGN KEY ("centre_id") REFERENCES "public"."centres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_decisions" ADD CONSTRAINT "pending_decisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_events" ADD CONSTRAINT "service_events_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_events" ADD CONSTRAINT "service_events_centre_id_centres_id_fk" FOREIGN KEY ("centre_id") REFERENCES "public"."centres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_events" ADD CONSTRAINT "service_events_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_centre_day_id_centre_days_id_fk" FOREIGN KEY ("centre_day_id") REFERENCES "public"."centre_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_centre_id_centres_id_fk" FOREIGN KEY ("centre_id") REFERENCES "public"."centres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_ref_key" ON "bookings" USING btree ("ref");--> statement-breakpoint
CREATE INDEX "bookings_user_idx" ON "bookings" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "bookings_slot_idx" ON "bookings" USING btree ("slot_id");--> statement-breakpoint
CREATE INDEX "bookings_centre_date_idx" ON "bookings" USING btree ("centre_id","date","status");--> statement-breakpoint
CREATE UNIQUE INDEX "centre_days_centre_date_key" ON "centre_days" USING btree ("centre_id","date");--> statement-breakpoint
CREATE INDEX "centre_days_date_idx" ON "centre_days" USING btree ("date");--> statement-breakpoint
CREATE INDEX "centre_events_centre_date_idx" ON "centre_events" USING btree ("centre_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "centres_code_key" ON "centres" USING btree ("code");--> statement-breakpoint
CREATE INDEX "centres_district_idx" ON "centres" USING btree ("district");--> statement-breakpoint
CREATE INDEX "holdings_user_idx" ON "holdings" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "holdings_user_crop_season_key" ON "holdings" USING btree ("user_id","crop","season");--> statement-breakpoint
CREATE UNIQUE INDEX "lots_receipt_key" ON "lots" USING btree ("receipt_no");--> statement-breakpoint
CREATE UNIQUE INDEX "lots_booking_key" ON "lots" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "lots_user_idx" ON "lots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "messages_user_idx" ON "messages" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "otp_mobile_idx" ON "otp_requests" USING btree ("mobile","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_lot_key" ON "payments" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status","initiated_at");--> statement-breakpoint
CREATE INDEX "pending_decisions_user_idx" ON "pending_decisions" USING btree ("user_id","resolved_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rates_key" ON "rates" USING btree ("crop","mandi","date");--> statement-breakpoint
CREATE INDEX "rates_crop_date_idx" ON "rates" USING btree ("crop","date");--> statement-breakpoint
CREATE INDEX "refresh_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_family_idx" ON "refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "service_events_centre_date_idx" ON "service_events" USING btree ("centre_id","date","ended_at");--> statement-breakpoint
CREATE UNIQUE INDEX "slots_day_start_key" ON "slots" USING btree ("centre_day_id","window_start");--> statement-breakpoint
CREATE INDEX "slots_window_idx" ON "slots" USING btree ("window_start");--> statement-breakpoint
CREATE UNIQUE INDEX "tokens_centre_date_seq_key" ON "tokens" USING btree ("centre_id","date","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "tokens_booking_key" ON "tokens" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tokens_client_uuid_key" ON "tokens" USING btree ("client_uuid");--> statement-breakpoint
CREATE INDEX "tokens_order_idx" ON "tokens" USING btree ("centre_id","date","window_start","checked_in_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_mobile_key" ON "users" USING btree ("mobile");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");