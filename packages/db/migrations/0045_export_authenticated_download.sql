-- Each archive range needs a fresh session, generation, lifecycle, and expiry
-- check. The caller must not hold a database transaction across R2 I/O.
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
CREATE FUNCTION public.authorize_account_export_download(
  p_user_id text, p_session_id text, p_request_id text
) RETURNS TABLE(archive_object_key text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_now timestamptz;
  v_state public.account_lifecycle_state;
  v_generation bigint;
  v_purge_due_at timestamptz;
BEGIN
  IF p_user_id IS NULL OR p_session_id IS NULL OR p_request_id IS NULL THEN RETURN; END IF;
  PERFORM 1 FROM public."user" WHERE id = p_user_id FOR SHARE;
  IF NOT FOUND THEN RETURN; END IF;
  v_now := clock_timestamp();
  PERFORM 1 FROM public.session live_session WHERE live_session.id = p_session_id
    AND live_session.user_id = p_user_id AND live_session.expires_at > v_now FOR SHARE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT lifecycle.state, lifecycle.generation, lifecycle.purge_due_at
    INTO v_state, v_generation, v_purge_due_at
    FROM public.account_lifecycles lifecycle WHERE lifecycle.user_id = p_user_id FOR SHARE;
  v_state := coalesce(v_state, 'active');
  v_generation := coalesce(v_generation, 0);
  IF v_state NOT IN ('active', 'pending_deletion')
    OR (v_state = 'pending_deletion' AND v_now >= v_purge_due_at) THEN RETURN; END IF;
  RETURN QUERY SELECT requests.archive_object_key FROM public.data_export_requests requests
    WHERE requests.id = p_request_id AND requests.user_id = p_user_id AND requests.status = 'ready'
      AND requests.lifecycle_generation = v_generation AND requests.expires_at > v_now
      AND requests.archive_object_key IS NOT NULL
    FOR SHARE;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.authorize_account_export_download(text, text, text)
  FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.authorize_account_export_download(text, text, text) TO app;--> statement-breakpoint
