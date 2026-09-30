-- squawk-ignore-file prefer-robust-stmts
-- squawk-ignore-file prefer-bigint-over-int
-- squawk-ignore-file constraint-missing-not-valid
-- squawk-ignore-file adding-foreign-key-constraint
-- squawk-ignore-file require-concurrent-index-creation
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
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_google_reauth_intents_state_digest_check" CHECK ("account_google_reauthentication_intents"."state_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "account_google_reauth_intents_nonce_digest_check" CHECK ("account_google_reauthentication_intents"."nonce_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "account_google_reauth_intents_generation_check" CHECK ("account_google_reauthentication_intents"."lifecycle_generation" >= 0),
	CONSTRAINT "account_google_reauth_intents_expiry_check" CHECK ("account_google_reauthentication_intents"."expires_at" > "account_google_reauthentication_intents"."created_at"),
	CONSTRAINT "account_google_reauth_intents_consumed_check" CHECK ("account_google_reauthentication_intents"."consumed_at" is null or "account_google_reauthentication_intents"."consumed_at" <= "account_google_reauthentication_intents"."expires_at")
);
--> statement-breakpoint
ALTER TABLE "account_google_reauthentication_intents" ADD CONSTRAINT "account_google_reauthentication_intents_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_google_reauthentication_intents" ADD CONSTRAINT "account_google_reauth_session_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_google_reauth_intents_session_idx" ON "account_google_reauthentication_intents" USING btree ("session_id");--> statement-breakpoint

CREATE FUNCTION public.account_policy_underage_restricted(subject_user_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.operator_cases
    WHERE subject_user_id = $1
      AND status = 'restricted'
      AND decision = 'temporary_restriction'
      AND review_due_at > now()
  )
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.account_policy_underage_restricted(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.account_policy_underage_restricted(text) TO app;--> statement-breakpoint
REVOKE ALL ON TABLE public.account_google_reauthentication_intents FROM app, lifecycle_worker;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE public.account_google_reauthentication_intents TO app;