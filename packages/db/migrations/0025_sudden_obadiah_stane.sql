-- squawk-ignore-file prefer-robust-stmts
-- squawk-ignore-file adding-foreign-key-constraint
-- squawk-ignore-file constraint-missing-not-valid
-- squawk-ignore-file identifier-too-long
-- squawk-ignore-file require-concurrent-index-creation
-- This is inactive future OIDC metadata only. It creates no proof, grant,
-- endpoint, or app runtime privilege.
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
CREATE TABLE "account_google_reauthentication_intents" (
	"state_digest" text PRIMARY KEY NOT NULL,
	"nonce_digest" text NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"action" "account_management_grant_action" NOT NULL,
	"lifecycle_generation" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_google_reauth_intents_state_digest_check" CHECK ("account_google_reauthentication_intents"."state_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "account_google_reauth_intents_nonce_digest_check" CHECK ("account_google_reauthentication_intents"."nonce_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "account_google_reauth_intents_generation_check" CHECK ("account_google_reauthentication_intents"."lifecycle_generation" between 0 and 9007199254740991),
	CONSTRAINT "account_google_reauth_intents_expiry_check" CHECK ("account_google_reauthentication_intents"."expires_at" > "account_google_reauthentication_intents"."created_at")
);
--> statement-breakpoint
ALTER TABLE "account_google_reauthentication_intents" ADD CONSTRAINT "account_google_reauthentication_intents_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_google_reauthentication_intents" ADD CONSTRAINT "account_google_reauthentication_intents_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_google_reauth_intents_user_idx" ON "account_google_reauthentication_intents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_google_reauth_intents_session_idx" ON "account_google_reauthentication_intents" USING btree ("session_id");--> statement-breakpoint
-- The prior foundation granted app broad lifecycle-table DML. No deployed
-- feature uses management grants, so leave them unavailable until a reviewed
-- issuer and consumer exist. Intent rows are likewise migration-only metadata.
REVOKE ALL ON TABLE public.account_google_reauthentication_intents FROM app, lifecycle_worker;--> statement-breakpoint
REVOKE ALL ON TABLE public.account_management_grants FROM app, lifecycle_worker;