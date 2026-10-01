-- squawk-ignore-file prefer-robust-stmts
-- squawk-ignore-file constraint-missing-not-valid
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
ALTER TABLE "data_export_requests" DROP CONSTRAINT IF EXISTS "data_export_requests_state_check";--> statement-breakpoint
ALTER TABLE "data_export_object_cleanup_tasks" ADD COLUMN IF NOT EXISTS "multipart_upload_id" text;--> statement-breakpoint
ALTER TABLE "data_export_object_cleanup_tasks" ADD CONSTRAINT "data_export_object_cleanup_tasks_multipart_upload_id_check" CHECK ("data_export_object_cleanup_tasks"."multipart_upload_id" is null or char_length("data_export_object_cleanup_tasks"."multipart_upload_id") between 1 and 1024) NOT VALID;--> statement-breakpoint
ALTER TABLE "data_export_object_cleanup_tasks" VALIDATE CONSTRAINT "data_export_object_cleanup_tasks_multipart_upload_id_check";--> statement-breakpoint
ALTER TABLE "data_export_requests" ADD CONSTRAINT "data_export_requests_state_check" CHECK (
    ("data_export_requests"."status" = 'ready' and "data_export_requests"."snapshot_cutoff_at" is not null and "data_export_requests"."archive_object_key" is not null and
      "data_export_requests"."ready_at" is not null and "data_export_requests"."expires_at" = "data_export_requests"."ready_at" + interval '24 hours' and
      "data_export_requests"."archive_cleanup_task_id" is null and "data_export_requests"."failure_category" is null and "data_export_requests"."lease_token" is null and "data_export_requests"."lease_expires_at" is null) or
    ("data_export_requests"."status" = 'requested' and "data_export_requests"."snapshot_cutoff_at" is null and "data_export_requests"."archive_object_key" is null and
      "data_export_requests"."ready_at" is null and "data_export_requests"."expires_at" is null and "data_export_requests"."archive_cleanup_task_id" is null and "data_export_requests"."failure_category" is null and "data_export_requests"."lease_token" is null and "data_export_requests"."lease_expires_at" is null) or
    ("data_export_requests"."status" = 'building' and "data_export_requests"."snapshot_cutoff_at" is not null and "data_export_requests"."archive_object_key" is null and
      "data_export_requests"."ready_at" is null and "data_export_requests"."expires_at" is null and "data_export_requests"."archive_cleanup_task_id" is null and "data_export_requests"."failure_category" is null and "data_export_requests"."lease_token" is not null and "data_export_requests"."lease_expires_at" is not null) or
    ("data_export_requests"."status" = 'failed' and "data_export_requests"."snapshot_cutoff_at" is null and "data_export_requests"."archive_object_key" is null and
      "data_export_requests"."ready_at" is null and "data_export_requests"."expires_at" is null and "data_export_requests"."archive_cleanup_task_id" is null and "data_export_requests"."failure_category" is not null and "data_export_requests"."lease_token" is null and "data_export_requests"."lease_expires_at" is null) or
    ("data_export_requests"."status" = 'cancelled' and "data_export_requests"."snapshot_cutoff_at" is null and "data_export_requests"."archive_object_key" is null and
      "data_export_requests"."ready_at" is null and "data_export_requests"."expires_at" is null and "data_export_requests"."archive_cleanup_task_id" is null and "data_export_requests"."failure_category" is null and "data_export_requests"."lease_token" is null and "data_export_requests"."lease_expires_at" is null) or
    ("data_export_requests"."status" = 'expired' and "data_export_requests"."snapshot_cutoff_at" is null and "data_export_requests"."archive_object_key" is null and
      "data_export_requests"."ready_at" is null and "data_export_requests"."expires_at" is null and "data_export_requests"."archive_cleanup_task_id" is not null and "data_export_requests"."failure_category" is null and "data_export_requests"."lease_token" is null and "data_export_requests"."lease_expires_at" is null)
  ) NOT VALID;--> statement-breakpoint
ALTER TABLE "data_export_requests" VALIDATE CONSTRAINT "data_export_requests_state_check";