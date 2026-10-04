-- Validate outside the transaction that introduced the constraints.
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
BEGIN;--> statement-breakpoint
ALTER TABLE public.data_export_object_cleanup_tasks
  VALIDATE CONSTRAINT data_export_cleanup_upload_pair_check;--> statement-breakpoint
ALTER TABLE public.data_export_object_cleanup_tasks
  VALIDATE CONSTRAINT data_export_cleanup_upload_id_check;--> statement-breakpoint
COMMIT;--> statement-breakpoint
