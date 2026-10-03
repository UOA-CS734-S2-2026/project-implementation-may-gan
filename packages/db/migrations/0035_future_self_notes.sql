-- squawk-ignore-file prefer-robust-stmts
-- squawk-ignore-file require-lock-timeout
-- squawk-ignore-file require-statement-timeout
-- squawk-ignore-file constraint-missing-not-valid
-- squawk-ignore-file adding-foreign-key-constraint
-- squawk-ignore-file require-concurrent-index-creation

-- Notes a user writes to their future self, plus the retry-safe delivery
-- records the scheduled job writes. All three tables are new and empty.
-- Purge order is delivery rows, notes, then the account.
CREATE TYPE "public"."future_self_note_delivery_status" AS ENUM('claimed', 'delivered');--> statement-breakpoint
CREATE TYPE "public"."future_self_note_status" AS ENUM('scheduled', 'delivered');--> statement-breakpoint
CREATE TABLE "future_self_note_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"note_id" text NOT NULL,
	"schedule_version" bigint NOT NULL,
	"deliver_on" date NOT NULL,
	"status" "future_self_note_delivery_status" DEFAULT 'claimed' NOT NULL,
	"lease_token" text,
	"lease_expires_at" timestamp with time zone,
	"attempts" bigint DEFAULT 1 NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "future_self_note_deliveries_note_version_unique" UNIQUE("note_id","schedule_version"),
	CONSTRAINT "future_self_note_deliveries_schedule_version_check" CHECK ("future_self_note_deliveries"."schedule_version" between 1 and 9007199254740991),
	CONSTRAINT "future_self_note_deliveries_attempts_check" CHECK ("future_self_note_deliveries"."attempts" between 1 and 9007199254740991),
	CONSTRAINT "future_self_note_deliveries_state_check" CHECK (("future_self_note_deliveries"."status" = 'claimed' and "future_self_note_deliveries"."lease_token" is not null and "future_self_note_deliveries"."lease_expires_at" is not null and "future_self_note_deliveries"."delivered_at" is null)
      or ("future_self_note_deliveries"."status" = 'delivered' and "future_self_note_deliveries"."lease_token" is null and "future_self_note_deliveries"."lease_expires_at" is null and "future_self_note_deliveries"."delivered_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "future_self_note_idempotency_keys" (
	"owner_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"note_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "future_self_note_idempotency_keys_pk" PRIMARY KEY("owner_id","idempotency_key"),
	CONSTRAINT "future_self_note_idempotency_keys_key_check" CHECK (char_length("future_self_note_idempotency_keys"."idempotency_key") between 1 and 255),
	CONSTRAINT "future_self_note_idempotency_keys_fingerprint_check" CHECK ("future_self_note_idempotency_keys"."request_fingerprint" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "future_self_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"body" text NOT NULL,
	"deliver_on" date NOT NULL,
	"status" "future_self_note_status" DEFAULT 'scheduled' NOT NULL,
	"schedule_version" bigint DEFAULT 1 NOT NULL,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "future_self_notes_body_length_check" CHECK (char_length("future_self_notes"."body") between 1 and 1000 and "future_self_notes"."body" = btrim("future_self_notes"."body")),
	CONSTRAINT "future_self_notes_schedule_version_check" CHECK ("future_self_notes"."schedule_version" between 1 and 9007199254740991),
	CONSTRAINT "future_self_notes_delivery_state_check" CHECK (("future_self_notes"."status" = 'scheduled' and "future_self_notes"."delivered_at" is null)
      or ("future_self_notes"."status" = 'delivered' and "future_self_notes"."delivered_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "future_self_note_deliveries" ADD CONSTRAINT "future_self_note_deliveries_note_id_future_self_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."future_self_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "future_self_note_idempotency_keys" ADD CONSTRAINT "future_self_note_idempotency_keys_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "future_self_note_idempotency_keys" ADD CONSTRAINT "future_self_note_keys_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."future_self_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "future_self_notes" ADD CONSTRAINT "future_self_notes_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "future_self_note_deliveries_lease_idx" ON "future_self_note_deliveries" USING btree ("lease_expires_at") WHERE "future_self_note_deliveries"."status" = 'claimed';--> statement-breakpoint
CREATE INDEX "future_self_note_idempotency_keys_note_id_idx" ON "future_self_note_idempotency_keys" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "future_self_notes_owner_deliver_on_idx" ON "future_self_notes" USING btree ("owner_id","deliver_on","id");--> statement-breakpoint
CREATE INDEX "future_self_notes_due_idx" ON "future_self_notes" USING btree ("deliver_on","id") WHERE "future_self_notes"."status" = 'scheduled';