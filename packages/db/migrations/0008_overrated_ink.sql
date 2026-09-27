-- squawk-ignore-file prefer-robust-stmts
-- squawk-ignore-file require-lock-timeout
-- squawk-ignore-file require-statement-timeout
-- squawk-ignore-file constraint-missing-not-valid
-- squawk-ignore-file adding-foreign-key-constraint
-- squawk-ignore-file require-concurrent-index-creation
-- squawk-ignore-file disallowed-unique-constraint

-- Do not deduplicate existing mappings. This guard stops before the unique
-- constraint is attempted and requires an approved manual remediation plan.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "account"
    GROUP BY "provider_id", "account_id"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'account provider/account duplicates require manual remediation';
  END IF;
END
$$;
--> statement-breakpoint
CREATE TABLE "social_link_confirmation" (
	"state_digest" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "social_link_confirmation" ADD CONSTRAINT "social_link_confirmation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "social_link_confirmation_user_expires_at_idx" ON "social_link_confirmation" USING btree ("user_id","expires_at");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_provider_id_account_id_unique" UNIQUE("provider_id","account_id");