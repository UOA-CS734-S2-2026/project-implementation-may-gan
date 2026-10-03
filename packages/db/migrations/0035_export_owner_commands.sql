-- Only session-bound, owner-scoped procedures may create or read export requests.
-- The account user lock serializes request admission with deletion transitions.
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
REVOKE ALL ON TABLE public.data_export_requests FROM app, lifecycle_worker;--> statement-breakpoint
CREATE FUNCTION public.request_account_export(p_user_id text, p_session_id text, p_request_id text)
RETURNS TABLE (request_id text, request_status text, requested_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz;
  v_state public.account_lifecycle_state;
  v_generation bigint;
  v_purge_due_at timestamptz;
  v_existing public.data_export_requests%ROWTYPE;
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
    INTO v_state, v_generation, v_purge_due_at
    FROM public.account_lifecycles lifecycle WHERE lifecycle.user_id = p_user_id FOR SHARE;
  v_state := coalesce(v_state, 'active');
  v_generation := coalesce(v_generation, 0);
  IF v_state NOT IN ('active', 'pending_deletion')
    OR (v_state = 'pending_deletion' AND v_now >= v_purge_due_at) THEN RETURN; END IF;

  SELECT requests.* INTO v_existing FROM public.data_export_requests requests
    WHERE requests.user_id = p_user_id AND requests.status IN ('requested', 'building', 'ready')
    FOR UPDATE;
  IF FOUND THEN
    request_id := v_existing.id;
    request_status := CASE WHEN v_existing.status = 'ready' AND v_existing.expires_at <= v_now
      THEN 'expired' ELSE v_existing.status::text END;
    requested_at := v_existing.requested_at;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.data_export_requests (id, user_id, lifecycle_generation, status, requested_at)
    VALUES (p_request_id, p_user_id, v_generation, 'requested', v_now);
  request_id := p_request_id;
  request_status := 'requested';
  requested_at := v_now;
  RETURN NEXT;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.request_account_export(text, text, text) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.request_account_export(text, text, text) TO app;--> statement-breakpoint

CREATE FUNCTION public.read_account_export_status(p_user_id text, p_session_id text)
RETURNS TABLE (request_id text, request_status text, requested_at timestamptz, ready_at timestamptz, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz;
  v_state public.account_lifecycle_state;
  v_purge_due_at timestamptz;
BEGIN
  IF p_user_id IS NULL OR p_session_id IS NULL THEN RETURN; END IF;
  PERFORM 1 FROM public."user" WHERE id = p_user_id FOR SHARE;
  IF NOT FOUND THEN RETURN; END IF;
  v_now := clock_timestamp();
  PERFORM 1 FROM public.session AS live_session
    WHERE live_session.id = p_session_id AND live_session.user_id = p_user_id
      AND live_session.expires_at > v_now FOR SHARE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT lifecycle.state, lifecycle.purge_due_at INTO v_state, v_purge_due_at
    FROM public.account_lifecycles lifecycle WHERE lifecycle.user_id = p_user_id FOR SHARE;
  v_state := coalesce(v_state, 'active');
  IF v_state NOT IN ('active', 'pending_deletion')
    OR (v_state = 'pending_deletion' AND v_now >= v_purge_due_at) THEN RETURN; END IF;

  RETURN QUERY SELECT requests.id,
    CASE WHEN requests.status = 'ready' AND requests.expires_at <= v_now
      THEN 'expired' ELSE requests.status::text END,
    requests.requested_at,
    CASE WHEN requests.status = 'ready' AND requests.expires_at > v_now THEN requests.ready_at ELSE NULL END,
    CASE WHEN requests.status = 'ready' AND requests.expires_at > v_now THEN requests.expires_at ELSE NULL END
    FROM public.data_export_requests requests
    WHERE requests.user_id = p_user_id
    ORDER BY requests.requested_at DESC, requests.id DESC LIMIT 1;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.read_account_export_status(text, text) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.read_account_export_status(text, text) TO app;--> statement-breakpoint
