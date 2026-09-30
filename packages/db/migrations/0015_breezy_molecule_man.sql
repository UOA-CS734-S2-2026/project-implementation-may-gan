-- squawk-ignore-file prefer-robust-stmts
-- squawk-ignore-file prefer-bigint-over-int
-- squawk-ignore-file constraint-missing-not-valid
-- squawk-ignore-file adding-foreign-key-constraint
-- squawk-ignore-file require-concurrent-index-creation
-- The protected migrator applies this forward-only change atomically. New
-- cleanup-task indexes begin empty, while the corrected constraints must scan
-- only the additive lifecycle records from migration 0014.
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
CREATE TYPE "public"."data_export_object_cleanup_status" AS ENUM('pending', 'deleting', 'failed');--> statement-breakpoint
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
ALTER TABLE "account_lifecycles" DROP CONSTRAINT "account_lifecycles_deadline_check";--> statement-breakpoint
ALTER TABLE "account_purge_receipts" DROP CONSTRAINT "account_purge_receipts_expiry_check";--> statement-breakpoint
ALTER TABLE "data_export_requests" DROP CONSTRAINT "data_export_requests_ready_expiry_check";--> statement-breakpoint
ALTER TABLE "data_export_requests" ADD COLUMN "archive_cleanup_task_id" text;--> statement-breakpoint
CREATE INDEX "data_export_object_cleanup_tasks_due_idx" ON "data_export_object_cleanup_tasks" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "data_export_object_cleanup_tasks_lease_idx" ON "data_export_object_cleanup_tasks" USING btree ("status","lease_expires_at");--> statement-breakpoint
ALTER TABLE "data_export_requests" ADD CONSTRAINT "data_export_requests_cleanup_task_fk" FOREIGN KEY ("archive_cleanup_task_id") REFERENCES "public"."data_export_object_cleanup_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_lifecycles" ADD CONSTRAINT "account_lifecycles_deadline_check" CHECK (
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
  );--> statement-breakpoint
ALTER TABLE "account_purge_receipts" ADD CONSTRAINT "account_purge_receipts_expiry_check" CHECK ("account_purge_receipts"."expires_at" = "account_purge_receipts"."completed_at" + interval '720 hours');--> statement-breakpoint
ALTER TABLE "data_export_requests" ADD CONSTRAINT "data_export_requests_state_check" CHECK (
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
  );--> statement-breakpoint

-- Export object keys stay inaccessible to application and worker credentials.
-- Later reviewed procedures, not direct table grants, may create or claim tasks.
REVOKE ALL ON TABLE public.data_export_object_cleanup_tasks FROM app, lifecycle_worker;