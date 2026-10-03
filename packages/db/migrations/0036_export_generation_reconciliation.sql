-- Keep published owner procedures immutable. Reconcile a stale generation or
-- expired archive under the account lock before accepting another request.
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
ALTER FUNCTION public.request_account_export(text, text, text) RENAME TO request_account_export_v1;--> statement-breakpoint
ALTER FUNCTION public.read_account_export_status(text, text) RENAME TO read_account_export_status_v1;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.request_account_export_v1(text, text, text) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.read_account_export_status_v1(text, text) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint

CREATE FUNCTION public.request_account_export(p_user_id text, p_session_id text, p_request_id text)
RETURNS TABLE (request_id text, request_status text, requested_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_now timestamptz;
  v_generation bigint;
  v_state public.account_lifecycle_state;
  v_purge_due_at timestamptz;
  v_existing public.data_export_requests%ROWTYPE;
  v_cleanup_id text;
BEGIN
  IF p_user_id IS NULL OR p_session_id IS NULL OR p_request_id IS NULL
    OR char_length(p_request_id) NOT BETWEEN 1 AND 200 THEN RETURN; END IF;
  PERFORM 1 FROM public."user" WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  v_now := clock_timestamp();
  PERFORM 1 FROM public.session AS live_session
    WHERE live_session.id = p_session_id AND live_session.user_id = p_user_id
      AND live_session.expires_at > v_now FOR SHARE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT lifecycle.state, lifecycle.generation, lifecycle.purge_due_at
    INTO v_state, v_generation, v_purge_due_at FROM public.account_lifecycles lifecycle
    WHERE lifecycle.user_id = p_user_id FOR SHARE;
  v_state := coalesce(v_state, 'active');
  v_generation := coalesce(v_generation, 0);
  IF v_state NOT IN ('active', 'pending_deletion')
    OR (v_state = 'pending_deletion' AND v_now >= v_purge_due_at) THEN RETURN; END IF;

  SELECT requests.* INTO v_existing FROM public.data_export_requests requests
    WHERE requests.user_id = p_user_id AND requests.status IN ('requested', 'building', 'ready')
    FOR UPDATE;
  IF FOUND AND (v_existing.lifecycle_generation <> v_generation
      OR (v_existing.status = 'ready' AND v_existing.expires_at <= v_now)) THEN
    IF v_existing.status = 'ready' THEN
      -- Task ownership is committed before dropping the only request-side key.
      v_cleanup_id := 'export_cleanup_' || encode(sha256(convert_to(v_existing.id, 'UTF8')), 'hex');
      INSERT INTO public.data_export_object_cleanup_tasks
        (id, archive_object_key, status, next_attempt_at)
      VALUES (v_cleanup_id, v_existing.archive_object_key, 'pending', v_now)
      ON CONFLICT (id) DO NOTHING;
    END IF;
    UPDATE public.data_export_requests requests SET
      status = CASE WHEN v_existing.status = 'ready' AND v_existing.expires_at <= v_now
        THEN 'expired'::public.data_export_status ELSE 'cancelled'::public.data_export_status END,
      snapshot_cutoff_at = NULL, archive_object_key = NULL, ready_at = NULL, expires_at = NULL,
      archive_cleanup_task_id = v_cleanup_id, lease_token = NULL, lease_expires_at = NULL,
      updated_at = v_now
    WHERE requests.id = v_existing.id;
  END IF;
  RETURN QUERY SELECT previous.request_id, previous.request_status, previous.requested_at
    FROM public.request_account_export_v1(p_user_id, p_session_id, p_request_id) AS previous;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.request_account_export(text, text, text) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.request_account_export(text, text, text) TO app;--> statement-breakpoint

CREATE FUNCTION public.read_account_export_status(p_user_id text, p_session_id text)
RETURNS TABLE (request_id text, request_status text, requested_at timestamptz, ready_at timestamptz, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_generation bigint;
BEGIN
  IF p_user_id IS NULL OR p_session_id IS NULL THEN RETURN; END IF;
  PERFORM 1 FROM public."user" WHERE id = p_user_id FOR SHARE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT lifecycle.generation INTO v_generation FROM public.account_lifecycles lifecycle
    WHERE lifecycle.user_id = p_user_id FOR SHARE;
  v_generation := coalesce(v_generation, 0);
  RETURN QUERY SELECT previous.request_id, previous.request_status,
    previous.requested_at, previous.ready_at, previous.expires_at
    FROM public.read_account_export_status_v1(p_user_id, p_session_id) AS previous
    JOIN public.data_export_requests requests ON requests.id = previous.request_id
    WHERE requests.lifecycle_generation = v_generation;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.read_account_export_status(text, text) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.read_account_export_status(text, text) TO app;--> statement-breakpoint
