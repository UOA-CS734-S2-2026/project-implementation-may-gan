-- squawk-ignore-file require-lock-timeout
-- squawk-ignore-file require-statement-timeout
-- squawk-ignore-file adding-required-field
-- squawk-ignore-file prefer-robust-stmts
-- squawk-ignore-file constraint-missing-not-valid
ALTER TABLE "account_google_reauthentication_intents" ADD COLUMN "verifier_ciphertext" text NOT NULL;--> statement-breakpoint
ALTER TABLE "account_google_reauthentication_intents" ADD COLUMN "verifier_key_version" text NOT NULL;--> statement-breakpoint
ALTER TABLE "account_google_reauthentication_intents" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "account_google_reauthentication_intents" ADD COLUMN "callback_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_google_reauthentication_intents" ADD COLUMN "callback_lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_google_reauthentication_intents" ADD COLUMN "proof_subject_digest" text;--> statement-breakpoint
ALTER TABLE "account_google_reauthentication_intents" ADD COLUMN "proof_subject_key_version" text;--> statement-breakpoint
ALTER TABLE "account_google_reauthentication_intents" ADD COLUMN "proofed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_google_reauthentication_intents" ADD COLUMN "failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_google_reauthentication_intents" ADD CONSTRAINT "account_google_reauth_intents_status_check" CHECK ("account_google_reauthentication_intents"."status" in ('pending', 'claimed', 'proofed', 'consumed', 'failed'));--> statement-breakpoint
ALTER TABLE "account_google_reauthentication_intents" ADD CONSTRAINT "account_google_reauth_intents_proof_digest_check" CHECK ("account_google_reauthentication_intents"."proof_subject_digest" is null or "account_google_reauthentication_intents"."proof_subject_digest" ~ '^[0-9a-f]{64}$');