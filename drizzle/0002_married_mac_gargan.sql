CREATE TABLE "queue_notifies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"centre_id" uuid NOT NULL,
	"date" date NOT NULL,
	"threshold" integer DEFAULT 5 NOT NULL,
	"channel" "channel" DEFAULT 'sms' NOT NULL,
	"fired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "queue_notifies" ADD CONSTRAINT "queue_notifies_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_notifies" ADD CONSTRAINT "queue_notifies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_notifies" ADD CONSTRAINT "queue_notifies_centre_id_centres_id_fk" FOREIGN KEY ("centre_id") REFERENCES "public"."centres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "queue_notifies_token_key" ON "queue_notifies" USING btree ("token_id");--> statement-breakpoint
CREATE INDEX "queue_notifies_centre_date_idx" ON "queue_notifies" USING btree ("centre_id","date","fired_at");