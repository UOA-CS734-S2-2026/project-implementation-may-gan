-- Persist a provider upload ID before sending parts. The earlier key reservation
-- remains the cleanup fallback if initiation succeeded but ID registration failed.
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
BEGIN;--> statement-breakpoint
ALTER TABLE public.data_export_object_cleanup_tasks
  ADD COLUMN IF NOT EXISTS upload_id text, ADD COLUMN IF NOT EXISTS upload_started_at timestamptz;--> statement-breakpoint
ALTER TABLE public.data_export_object_cleanup_tasks ADD CONSTRAINT data_export_cleanup_upload_pair_check
  CHECK ((upload_id IS NULL) = (upload_started_at IS NULL)) NOT VALID;--> statement-breakpoint
ALTER TABLE public.data_export_object_cleanup_tasks ADD CONSTRAINT data_export_cleanup_upload_id_check
  CHECK (upload_id IS NULL OR (char_length(upload_id) BETWEEN 1 AND 512 AND upload_id ~ '^[A-Za-z0-9_+/=-]+$')) NOT VALID;--> statement-breakpoint
CREATE FUNCTION public.register_account_export_upload(
  p_request_id text, p_lease_token text, p_object_key text, p_upload_id text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_owner text;
  v_request public.data_export_requests%ROWTYPE;
  v_state public.account_lifecycle_state;
  v_generation bigint;
  v_purge_due_at timestamptz;
  v_now timestamptz;
  v_task_id text;
BEGIN
  IF p_request_id IS NULL OR p_lease_token IS NULL OR p_object_key IS NULL
    OR p_upload_id IS NULL OR char_length(p_upload_id) NOT BETWEEN 1 AND 512
    OR p_upload_id !~ '^[A-Za-z0-9_+/=-]+$' THEN RETURN false; END IF;
  SELECT requests.user_id INTO v_owner FROM public.data_export_requests requests WHERE requests.id = p_request_id;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public."user" WHERE id = v_owner FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT requests.* INTO v_request FROM public.data_export_requests requests WHERE requests.id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  v_now := clock_timestamp();
  SELECT lifecycle.state, lifecycle.generation, lifecycle.purge_due_at
    INTO v_state, v_generation, v_purge_due_at FROM public.account_lifecycles lifecycle
    WHERE lifecycle.user_id = v_owner FOR SHARE;
  v_state := coalesce(v_state, 'active');
  v_generation := coalesce(v_generation, 0);
  IF v_request.status <> 'building' OR v_request.lease_token IS DISTINCT FROM p_lease_token
    OR v_request.lease_expires_at <= v_now OR v_request.lifecycle_generation <> v_generation
    OR v_state NOT IN ('active', 'pending_deletion')
    OR (v_state = 'pending_deletion' AND v_now >= v_purge_due_at) THEN RETURN false; END IF;
  v_task_id := 'export_cleanup_' || encode(sha256(convert_to(v_request.id || ':' || p_lease_token, 'UTF8')), 'hex');
  UPDATE public.data_export_object_cleanup_tasks task SET upload_id = p_upload_id,
    upload_started_at = v_now, updated_at = v_now
    WHERE task.id = v_task_id AND task.archive_object_key = p_object_key
      AND task.status = 'pending' AND task.next_attempt_at > v_now AND task.upload_id IS NULL;
  IF FOUND THEN RETURN true; END IF;
  PERFORM 1 FROM public.data_export_object_cleanup_tasks task
    WHERE task.id = v_task_id AND task.archive_object_key = p_object_key
      AND task.status = 'pending' AND task.next_attempt_at > v_now AND task.upload_id = p_upload_id;
  RETURN FOUND;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.register_account_export_upload(text, text, text, text)
  FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.register_account_export_upload(text, text, text, text)
  TO lifecycle_worker;--> statement-breakpoint
COMMIT;--> statement-breakpoint
