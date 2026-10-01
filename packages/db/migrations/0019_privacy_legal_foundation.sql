-- squawk-ignore-file prefer-robust-stmts
-- squawk-ignore-file prefer-bigint-over-int
-- squawk-ignore-file constraint-missing-not-valid
-- squawk-ignore-file adding-foreign-key-constraint
-- squawk-ignore-file require-concurrent-index-creation
-- New lifecycle and legal tables are empty. The protected migration runner holds
-- the advisory lock across this transaction.
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
CREATE TYPE "public"."account_lifecycle_state" AS ENUM('active', 'pending_deletion', 'purging', 'purge_failed');--> statement-breakpoint
CREATE TYPE "public"."account_management_grant_action" AS ENUM('request_deletion', 'cancel_deletion');--> statement-breakpoint
CREATE TYPE "public"."data_export_object_cleanup_status" AS ENUM('pending', 'deleting', 'failed');--> statement-breakpoint
CREATE TYPE "public"."data_export_status" AS ENUM('requested', 'building', 'ready', 'failed', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."legal_document_kind" AS ENUM('terms', 'privacy_policy');--> statement-breakpoint
CREATE TYPE "public"."legal_document_status" AS ENUM('draft', 'notice', 'effective', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."operator_case_decision" AS ENUM('no_action', 'temporary_restriction');--> statement-breakpoint
CREATE TYPE "public"."operator_case_status" AS ENUM('open', 'reviewed', 'restricted', 'closed');--> statement-breakpoint
CREATE TYPE "public"."operator_case_type" AS ENUM('underage_report');--> statement-breakpoint
CREATE TYPE "public"."purge_receipt_outcome" AS ENUM('completed');--> statement-breakpoint
CREATE TABLE "account_lifecycles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"state" "account_lifecycle_state" DEFAULT 'active' NOT NULL,
	"request_id" text,
	"idempotency_key_digest" text,
	"generation" bigint DEFAULT 0 NOT NULL,
	"requested_at" timestamp with time zone,
	"cancel_until" timestamp with time zone,
	"purge_due_at" timestamp with time zone,
	"purge_started_at" timestamp with time zone,
	"last_error_category" text,
	"next_attempt_at" timestamp with time zone,
	"lease_token" text,
	"lease_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_lifecycles_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "account_lifecycles_generation_check" CHECK ("account_lifecycles"."generation" >= 0),
	CONSTRAINT "account_lifecycles_request_id_check" CHECK ("account_lifecycles"."request_id" is null or char_length("account_lifecycles"."request_id") between 1 and 200),
	CONSTRAINT "account_lifecycles_idempotency_key_digest_check" CHECK ("account_lifecycles"."idempotency_key_digest" is null or "account_lifecycles"."idempotency_key_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "account_lifecycles_error_category_check" CHECK ("account_lifecycles"."last_error_category" is null or char_length("account_lifecycles"."last_error_category") between 1 and 100),
	CONSTRAINT "account_lifecycles_lease_pair_check" CHECK (("account_lifecycles"."lease_token" is null) = ("account_lifecycles"."lease_expires_at" is null)),
	CONSTRAINT "account_lifecycles_lease_token_check" CHECK ("account_lifecycles"."lease_token" is null or char_length("account_lifecycles"."lease_token") between 1 and 200),
	CONSTRAINT "account_lifecycles_deadline_check" CHECK (
    ("account_lifecycles"."state" = 'active' and
      "account_lifecycles"."request_id" is null and "account_lifecycles"."idempotency_key_digest" is null and
      "account_lifecycles"."requested_at" is null and "account_lifecycles"."cancel_until" is null and "account_lifecycles"."purge_due_at" is null and
      "account_lifecycles"."purge_started_at" is null and "account_lifecycles"."last_error_category" is null and "account_lifecycles"."next_attempt_at" is null) or
    ("account_lifecycles"."state" = 'pending_deletion' and
      "account_lifecycles"."request_id" is not null and "account_lifecycles"."idempotency_key_digest" is not null and
      "account_lifecycles"."requested_at" is not null and "account_lifecycles"."cancel_until" = "account_lifecycles"."requested_at" + interval '168 hours' and
      "account_lifecycles"."purge_due_at" = "account_lifecycles"."requested_at" + interval '336 hours' and
      "account_lifecycles"."purge_started_at" is null and "account_lifecycles"."last_error_category" is null and "account_lifecycles"."next_attempt_at" is null) or
    ("account_lifecycles"."state" = 'purging' and
      "account_lifecycles"."request_id" is not null and "account_lifecycles"."idempotency_key_digest" is not null and
      "account_lifecycles"."requested_at" is not null and "account_lifecycles"."cancel_until" = "account_lifecycles"."requested_at" + interval '168 hours' and
      "account_lifecycles"."purge_due_at" = "account_lifecycles"."requested_at" + interval '336 hours' and
      "account_lifecycles"."purge_started_at" is not null and "account_lifecycles"."last_error_category" is null and "account_lifecycles"."next_attempt_at" is null) or
    ("account_lifecycles"."state" = 'purge_failed' and
      "account_lifecycles"."request_id" is not null and "account_lifecycles"."idempotency_key_digest" is not null and
      "account_lifecycles"."requested_at" is not null and "account_lifecycles"."cancel_until" = "account_lifecycles"."requested_at" + interval '168 hours' and
      "account_lifecycles"."purge_due_at" = "account_lifecycles"."requested_at" + interval '336 hours' and
      "account_lifecycles"."purge_started_at" is not null and "account_lifecycles"."last_error_category" is not null and "account_lifecycles"."next_attempt_at" is not null)
  )
);
--> statement-breakpoint
CREATE TABLE "account_management_grants" (
	"token_digest" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"action" "account_management_grant_action" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_management_grants_digest_check" CHECK ("account_management_grants"."token_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "account_management_grants_expiry_check" CHECK ("account_management_grants"."expires_at" > "account_management_grants"."created_at"),
	CONSTRAINT "account_management_grants_consumed_check" CHECK ("account_management_grants"."consumed_at" is null or "account_management_grants"."consumed_at" <= "account_management_grants"."expires_at")
);
--> statement-breakpoint
CREATE TABLE "account_purge_receipts" (
	"request_id" text PRIMARY KEY NOT NULL,
	"subject_digest" text NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"outcome" "purge_receipt_outcome" DEFAULT 'completed' NOT NULL,
	"completed_stage_count" integer NOT NULL,
	CONSTRAINT "account_purge_receipts_request_id_check" CHECK (char_length("account_purge_receipts"."request_id") between 1 and 200),
	CONSTRAINT "account_purge_receipts_subject_digest_check" CHECK ("account_purge_receipts"."subject_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "account_purge_receipts_completion_check" CHECK ("account_purge_receipts"."completed_at" >= "account_purge_receipts"."requested_at"),
	CONSTRAINT "account_purge_receipts_expiry_check" CHECK ("account_purge_receipts"."expires_at" = "account_purge_receipts"."completed_at" + interval '720 hours'),
	CONSTRAINT "account_purge_receipts_stage_count_check" CHECK ("account_purge_receipts"."completed_stage_count" between 0 and 20)
);
--> statement-breakpoint
CREATE TABLE "age_declarations" (
	"user_id" text NOT NULL,
	"declaration_version" text NOT NULL,
	"declared_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "age_declarations_pk" PRIMARY KEY("user_id","declaration_version"),
	CONSTRAINT "age_declarations_version_check" CHECK (char_length("age_declarations"."declaration_version") between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "data_export_object_cleanup_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"archive_object_key" text NOT NULL,
	"status" "data_export_object_cleanup_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"lease_token" text,
	"lease_expires_at" timestamp with time zone,
	"failure_category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_export_object_cleanup_tasks_id_check" CHECK (char_length("data_export_object_cleanup_tasks"."id") between 1 and 200),
	CONSTRAINT "data_export_object_cleanup_tasks_archive_key_check" CHECK (char_length("data_export_object_cleanup_tasks"."archive_object_key") between 1 and 1024),
	CONSTRAINT "data_export_object_cleanup_tasks_attempt_count_check" CHECK ("data_export_object_cleanup_tasks"."attempt_count" >= 0),
	CONSTRAINT "data_export_object_cleanup_tasks_failure_category_check" CHECK ("data_export_object_cleanup_tasks"."failure_category" is null or char_length("data_export_object_cleanup_tasks"."failure_category") between 1 and 100),
	CONSTRAINT "data_export_object_cleanup_tasks_lease_pair_check" CHECK (("data_export_object_cleanup_tasks"."lease_token" is null) = ("data_export_object_cleanup_tasks"."lease_expires_at" is null)),
	CONSTRAINT "data_export_object_cleanup_tasks_state_check" CHECK (
    ("data_export_object_cleanup_tasks"."status" = 'pending' and "data_export_object_cleanup_tasks"."failure_category" is null and "data_export_object_cleanup_tasks"."lease_token" is null and "data_export_object_cleanup_tasks"."next_attempt_at" is not null) or
    ("data_export_object_cleanup_tasks"."status" = 'deleting' and "data_export_object_cleanup_tasks"."failure_category" is null and "data_export_object_cleanup_tasks"."lease_token" is not null and "data_export_object_cleanup_tasks"."next_attempt_at" is null) or
    ("data_export_object_cleanup_tasks"."status" = 'failed' and "data_export_object_cleanup_tasks"."failure_category" is not null and "data_export_object_cleanup_tasks"."lease_token" is null and "data_export_object_cleanup_tasks"."next_attempt_at" is not null)
  )
);
--> statement-breakpoint
CREATE TABLE "data_export_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"lifecycle_generation" bigint NOT NULL,
	"status" "data_export_status" DEFAULT 'requested' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"snapshot_cutoff_at" timestamp with time zone,
	"archive_object_key" text,
	"ready_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"archive_cleanup_task_id" text,
	"lease_token" text,
	"lease_expires_at" timestamp with time zone,
	"failure_category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_export_requests_generation_check" CHECK ("data_export_requests"."lifecycle_generation" >= 0),
	CONSTRAINT "data_export_requests_id_check" CHECK (char_length("data_export_requests"."id") between 1 and 200),
	CONSTRAINT "data_export_requests_archive_key_check" CHECK ("data_export_requests"."archive_object_key" is null or char_length("data_export_requests"."archive_object_key") between 1 and 1024),
	CONSTRAINT "data_export_requests_failure_category_check" CHECK ("data_export_requests"."failure_category" is null or char_length("data_export_requests"."failure_category") between 1 and 100),
	CONSTRAINT "data_export_requests_lease_pair_check" CHECK (("data_export_requests"."lease_token" is null) = ("data_export_requests"."lease_expires_at" is null)),
	CONSTRAINT "data_export_requests_state_check" CHECK (
    ("data_export_requests"."status" = 'ready' and "data_export_requests"."snapshot_cutoff_at" is not null and "data_export_requests"."archive_object_key" is not null and
      "data_export_requests"."ready_at" is not null and "data_export_requests"."expires_at" = "data_export_requests"."ready_at" + interval '24 hours' and
      "data_export_requests"."archive_cleanup_task_id" is null and "data_export_requests"."failure_category" is null) or
    ("data_export_requests"."status" in ('requested', 'building') and "data_export_requests"."snapshot_cutoff_at" is null and "data_export_requests"."archive_object_key" is null and
      "data_export_requests"."ready_at" is null and "data_export_requests"."expires_at" is null and "data_export_requests"."archive_cleanup_task_id" is null and "data_export_requests"."failure_category" is null) or
    ("data_export_requests"."status" = 'failed' and "data_export_requests"."snapshot_cutoff_at" is null and "data_export_requests"."archive_object_key" is null and
      "data_export_requests"."ready_at" is null and "data_export_requests"."expires_at" is null and "data_export_requests"."failure_category" is not null) or
    ("data_export_requests"."status" = 'cancelled' and "data_export_requests"."snapshot_cutoff_at" is null and "data_export_requests"."archive_object_key" is null and
      "data_export_requests"."ready_at" is null and "data_export_requests"."expires_at" is null and "data_export_requests"."failure_category" is null) or
    ("data_export_requests"."status" = 'expired' and "data_export_requests"."snapshot_cutoff_at" is null and "data_export_requests"."archive_object_key" is null and
      "data_export_requests"."ready_at" is null and "data_export_requests"."expires_at" is null and "data_export_requests"."archive_cleanup_task_id" is not null and "data_export_requests"."failure_category" is null)
  )
);
--> statement-breakpoint
CREATE TABLE "legal_document_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "legal_document_kind" NOT NULL,
	"version" integer NOT NULL,
	"content_digest" text NOT NULL,
	"status" "legal_document_status" DEFAULT 'draft' NOT NULL,
	"material_change" boolean DEFAULT false NOT NULL,
	"notice_starts_at" timestamp with time zone,
	"effective_at" timestamp with time zone,
	"urgent_change_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_document_versions_kind_version_unique" UNIQUE("kind","version"),
	CONSTRAINT "legal_document_versions_id_check" CHECK (char_length("legal_document_versions"."id") between 1 and 200),
	CONSTRAINT "legal_document_versions_version_check" CHECK ("legal_document_versions"."version" > 0),
	CONSTRAINT "legal_document_versions_content_digest_check" CHECK ("legal_document_versions"."content_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "legal_document_versions_urgent_reason_check" CHECK ("legal_document_versions"."urgent_change_reason" is null or char_length("legal_document_versions"."urgent_change_reason") between 1 and 500),
	CONSTRAINT "legal_document_versions_status_check" CHECK (
    ("legal_document_versions"."status" = 'draft' and "legal_document_versions"."notice_starts_at" is null and "legal_document_versions"."effective_at" is null and "legal_document_versions"."urgent_change_reason" is null) or
    ("legal_document_versions"."status" = 'notice' and "legal_document_versions"."notice_starts_at" is not null and "legal_document_versions"."effective_at" is not null and "legal_document_versions"."notice_starts_at" < "legal_document_versions"."effective_at") or
    ("legal_document_versions"."status" = 'effective' and "legal_document_versions"."effective_at" is not null) or
    ("legal_document_versions"."status" = 'superseded' and "legal_document_versions"."effective_at" is not null)
  ),
	CONSTRAINT "legal_document_versions_urgent_change_check" CHECK (
    "legal_document_versions"."urgent_change_reason" is null or
    ("legal_document_versions"."material_change" and "legal_document_versions"."notice_starts_at" is not null and "legal_document_versions"."effective_at" is not null and "legal_document_versions"."notice_starts_at" < "legal_document_versions"."effective_at")
  )
);
--> statement-breakpoint
CREATE TABLE "operator_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_user_id" text NOT NULL,
	"type" "operator_case_type" NOT NULL,
	"status" "operator_case_status" DEFAULT 'open' NOT NULL,
	"decision" "operator_case_decision",
	"reason_category" text,
	"operator_reference" text,
	"review_due_at" timestamp with time zone NOT NULL,
	"reviewed_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operator_cases_id_check" CHECK (char_length("operator_cases"."id") between 1 and 200),
	CONSTRAINT "operator_cases_reason_category_check" CHECK ("operator_cases"."reason_category" is null or char_length("operator_cases"."reason_category") between 1 and 100),
	CONSTRAINT "operator_cases_operator_reference_check" CHECK ("operator_cases"."operator_reference" is null or char_length("operator_cases"."operator_reference") between 1 and 200),
	CONSTRAINT "operator_cases_state_check" CHECK (
    ("operator_cases"."status" = 'open' and "operator_cases"."decision" is null and "operator_cases"."reviewed_at" is null and "operator_cases"."resolved_at" is null) or
    ("operator_cases"."status" = 'reviewed' and "operator_cases"."decision" = 'no_action' and "operator_cases"."reviewed_at" is not null and "operator_cases"."resolved_at" is null) or
    ("operator_cases"."status" = 'restricted' and "operator_cases"."decision" = 'temporary_restriction' and "operator_cases"."reviewed_at" is not null and "operator_cases"."resolved_at" is null) or
    ("operator_cases"."status" = 'closed' and "operator_cases"."decision" is not null and "operator_cases"."reviewed_at" is not null and "operator_cases"."resolved_at" is not null)
  )
);
--> statement-breakpoint
CREATE TABLE "registration_intents" (
	"token_digest" text PRIMARY KEY NOT NULL,
	"terms_version_id" text NOT NULL,
	"age_declaration_version" text NOT NULL,
	"flow_binding_digest" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registration_intents_token_digest_check" CHECK ("registration_intents"."token_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "registration_intents_flow_binding_digest_check" CHECK ("registration_intents"."flow_binding_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "registration_intents_age_declaration_version_check" CHECK (char_length("registration_intents"."age_declaration_version") between 1 and 200),
	CONSTRAINT "registration_intents_expiry_check" CHECK ("registration_intents"."expires_at" > "registration_intents"."created_at"),
	CONSTRAINT "registration_intents_consumed_check" CHECK ("registration_intents"."consumed_at" is null or "registration_intents"."consumed_at" <= "registration_intents"."expires_at")
);
--> statement-breakpoint
CREATE TABLE "terms_acceptances" (
	"user_id" text NOT NULL,
	"terms_version_id" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "terms_acceptances_pk" PRIMARY KEY("user_id","terms_version_id")
);
--> statement-breakpoint
ALTER TABLE "account_lifecycles" ADD CONSTRAINT "account_lifecycles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_management_grants" ADD CONSTRAINT "account_management_grants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_management_grants" ADD CONSTRAINT "account_management_grants_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "age_declarations" ADD CONSTRAINT "age_declarations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_export_requests" ADD CONSTRAINT "data_export_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_export_requests" ADD CONSTRAINT "data_export_requests_cleanup_task_fk" FOREIGN KEY ("archive_cleanup_task_id") REFERENCES "public"."data_export_object_cleanup_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_cases" ADD CONSTRAINT "operator_cases_subject_user_id_user_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_intents" ADD CONSTRAINT "registration_intents_terms_version_fk" FOREIGN KEY ("terms_version_id") REFERENCES "public"."legal_document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms_acceptances" ADD CONSTRAINT "terms_acceptances_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms_acceptances" ADD CONSTRAINT "terms_acceptances_terms_version_fk" FOREIGN KEY ("terms_version_id") REFERENCES "public"."legal_document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_lifecycles_due_idx" ON "account_lifecycles" USING btree ("state","cancel_until","purge_due_at");--> statement-breakpoint
CREATE INDEX "account_lifecycles_retry_idx" ON "account_lifecycles" USING btree ("state","next_attempt_at");--> statement-breakpoint
CREATE INDEX "account_lifecycles_lease_idx" ON "account_lifecycles" USING btree ("state","lease_expires_at");--> statement-breakpoint
CREATE INDEX "account_management_grants_user_action_expires_idx" ON "account_management_grants" USING btree ("user_id","action","expires_at");--> statement-breakpoint
CREATE INDEX "account_management_grants_session_idx" ON "account_management_grants" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "account_purge_receipts_expiry_idx" ON "account_purge_receipts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "data_export_object_cleanup_tasks_due_idx" ON "data_export_object_cleanup_tasks" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "data_export_object_cleanup_tasks_lease_idx" ON "data_export_object_cleanup_tasks" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE INDEX "data_export_requests_due_idx" ON "data_export_requests" USING btree ("status","requested_at");--> statement-breakpoint
CREATE INDEX "data_export_requests_expiry_idx" ON "data_export_requests" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "data_export_requests_lease_idx" ON "data_export_requests" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "data_export_requests_one_active_per_user_unique" ON "data_export_requests" USING btree ("user_id") WHERE "data_export_requests"."status" in ('requested', 'building', 'ready');--> statement-breakpoint
CREATE INDEX "legal_document_versions_current_idx" ON "legal_document_versions" USING btree ("kind","status","effective_at");--> statement-breakpoint
CREATE INDEX "operator_cases_subject_status_idx" ON "operator_cases" USING btree ("subject_user_id","status");--> statement-breakpoint
CREATE INDEX "operator_cases_review_due_idx" ON "operator_cases" USING btree ("status","review_due_at");--> statement-breakpoint
CREATE INDEX "registration_intents_expiry_idx" ON "registration_intents" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "registration_intents_terms_version_idx" ON "registration_intents" USING btree ("terms_version_id");--> statement-breakpoint
CREATE INDEX "terms_acceptances_terms_version_idx" ON "terms_acceptances" USING btree ("terms_version_id");--> statement-breakpoint

-- The owner-managed role bootstrap must reserve this role before the migration.
-- It has no runtime binding or direct lifecycle-table grant in this slice.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lifecycle_worker') THEN
    RAISE EXCEPTION 'lifecycle_worker role must be bootstrapped before lifecycle migrations';
  END IF;
END
$$;--> statement-breakpoint

-- Existing default privileges grant app broad DML. Keep lifecycle and legal data
-- narrowly scoped, and reserve physical account deletion for a later procedure.
REVOKE DELETE ON TABLE public."user" FROM app;--> statement-breakpoint
REVOKE ALL ON TABLE
  public.account_lifecycles,
  public.account_management_grants,
  public.account_purge_receipts,
  public.age_declarations,
  public.data_export_requests,
  public.data_export_object_cleanup_tasks,
  public.legal_document_versions,
  public.operator_cases,
  public.registration_intents,
  public.terms_acceptances
FROM app, lifecycle_worker;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE
  public.account_lifecycles,
  public.account_management_grants,
  public.data_export_requests,
  public.registration_intents
TO app;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE
  public.age_declarations,
  public.terms_acceptances
TO app;--> statement-breakpoint
GRANT SELECT ON TABLE public.legal_document_versions TO app;