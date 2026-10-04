-- squawk-ignore-file prefer-robust-stmts
-- squawk-ignore-file adding-foreign-key-constraint
-- squawk-ignore-file constraint-missing-not-valid
-- squawk-ignore-file require-concurrent-index-creation
-- squawk-ignore-file identifier-too-long
-- squawk-ignore-file disallowed-unique-constraint
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
CREATE TYPE "public"."notification_delivery_status" AS ENUM('pending', 'leased', 'delivered', 'suppressed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('direct_message', 'friend_request', 'final_hour_reminder', 'friends_post_release');--> statement-breakpoint
CREATE TABLE "account_notification_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"recipient_id" text NOT NULL,
	"device_registration_id" text NOT NULL,
	"status" "notification_delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" bigint DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"lease_token" text,
	"lease_expires_at" timestamp with time zone,
	"failure_category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "notification_deliveries_event_device_unique" UNIQUE("event_id","device_registration_id"),
	CONSTRAINT "notification_deliveries_attempts_check" CHECK ("notification_deliveries"."attempts" between 0 and 20),
	CONSTRAINT "notification_deliveries_lease_pair_check" CHECK (("notification_deliveries"."lease_token" is null) = ("notification_deliveries"."lease_expires_at" is null)),
	CONSTRAINT "notification_deliveries_status_lease_check" CHECK (
    ("notification_deliveries"."status" = 'leased' and "notification_deliveries"."lease_token" is not null) or
    ("notification_deliveries"."status" <> 'leased' and "notification_deliveries"."lease_token" is null)
  ),
	CONSTRAINT "notification_deliveries_terminal_check" CHECK (
    ("notification_deliveries"."status" = 'delivered' and "notification_deliveries"."delivered_at" is not null) or
    ("notification_deliveries"."status" <> 'delivered' and "notification_deliveries"."delivered_at" is null)
  ),
	CONSTRAINT "notification_deliveries_failure_check" CHECK ("notification_deliveries"."failure_category" is null or char_length("notification_deliveries"."failure_category") between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "notification_events" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"recipient_id" text NOT NULL,
	"deduplication_key" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_events_dedup_unique" UNIQUE("kind","recipient_id","deduplication_key"),
	CONSTRAINT "notification_events_id_recipient_unique" UNIQUE("id","recipient_id"),
	CONSTRAINT "notification_events_dedup_key_check" CHECK (char_length("notification_events"."deduplication_key") between 1 and 255),
	CONSTRAINT "notification_events_source_type_check" CHECK (char_length("notification_events"."source_type") between 1 and 64),
	CONSTRAINT "notification_events_source_id_check" CHECK (char_length("notification_events"."source_id") between 1 and 255),
	CONSTRAINT "notification_events_target_type_check" CHECK (char_length("notification_events"."target_type") between 1 and 64),
	CONSTRAINT "notification_events_target_id_check" CHECK (char_length("notification_events"."target_id") between 1 and 255),
	CONSTRAINT "notification_events_expiry_check" CHECK ("notification_events"."expires_at" > "notification_events"."created_at")
);
--> statement-breakpoint
ALTER TABLE "push_devices" ADD COLUMN "notification_schema_version" bigint;--> statement-breakpoint
ALTER TABLE "account_notification_preferences" ADD CONSTRAINT "account_notification_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_id_user_unique" UNIQUE("id","user_id");--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_event_recipient_fk" FOREIGN KEY ("event_id","recipient_id") REFERENCES "public"."notification_events"("id","recipient_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_recipient_id_user_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_device_recipient_fk" FOREIGN KEY ("device_registration_id","recipient_id") REFERENCES "public"."push_devices"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_recipient_id_user_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_deliveries_due_idx" ON "notification_deliveries" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "notification_deliveries_lease_idx" ON "notification_deliveries" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE INDEX "notification_deliveries_recipient_idx" ON "notification_deliveries" USING btree ("recipient_id","created_at");--> statement-breakpoint
CREATE INDEX "notification_events_recipient_created_idx" ON "notification_events" USING btree ("recipient_id","created_at");--> statement-breakpoint
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_notification_schema_version_check" CHECK ("push_devices"."notification_schema_version" is null or "push_devices"."notification_schema_version" = 1);--> statement-breakpoint
REVOKE ALL ON TABLE "account_notification_preferences", "notification_events", "notification_deliveries" FROM app, lifecycle_worker;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "account_notification_preferences", "notification_events", "notification_deliveries" TO app;