-- A worker lease never grants table access. All source reads must recheck this
-- request ID, token, generation, lifecycle, and database-clock deadline.
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
CREATE FUNCTION public.claim_account_exports(p_limit integer, p_lease_token text, p_lease_seconds integer)
RETURNS TABLE(request_id text, owner_id text, lifecycle_generation bigint, selection_cutoff_at timestamptz, lease_expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  candidate record;
  locked public.data_export_requests%ROWTYPE;
  v_now timestamptz;
  v_state public.account_lifecycle_state;
  v_generation bigint;
  v_purge_due_at timestamptz;
  claimed integer := 0;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 10
    OR p_lease_token IS NULL OR char_length(p_lease_token) NOT BETWEEN 1 AND 200
    OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 10 AND 300 THEN RETURN; END IF;

  FOR candidate IN SELECT requests.id, requests.user_id
    FROM public.data_export_requests requests
    WHERE requests.status = 'requested'
      OR (requests.status = 'building' AND requests.lease_expires_at <= clock_timestamp())
    ORDER BY requests.requested_at, requests.id LIMIT p_limit * 4
  LOOP
    PERFORM 1 FROM public."user" WHERE id = candidate.user_id FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN CONTINUE; END IF;
    SELECT requests.* INTO locked FROM public.data_export_requests requests
      WHERE requests.id = candidate.id AND (requests.status = 'requested'
        OR (requests.status = 'building' AND requests.lease_expires_at <= clock_timestamp()))
      FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN CONTINUE; END IF;
    v_now := clock_timestamp();
    SELECT lifecycle.state, lifecycle.generation, lifecycle.purge_due_at
      INTO v_state, v_generation, v_purge_due_at
      FROM public.account_lifecycles lifecycle WHERE lifecycle.user_id = locked.user_id FOR SHARE;
    v_state := coalesce(v_state, 'active');
    v_generation := coalesce(v_generation, 0);
    IF locked.lifecycle_generation <> v_generation
      OR v_state NOT IN ('active', 'pending_deletion')
      OR (v_state = 'pending_deletion' AND v_now >= v_purge_due_at) THEN
      UPDATE public.data_export_requests requests SET status = 'cancelled',
        lease_token = NULL, lease_expires_at = NULL, updated_at = v_now
        WHERE requests.id = locked.id;
      CONTINUE;
    END IF;
    UPDATE public.data_export_requests requests SET status = 'building',
      lease_token = p_lease_token, lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
      updated_at = v_now WHERE requests.id = locked.id;
    request_id := locked.id;
    owner_id := locked.user_id;
    lifecycle_generation := locked.lifecycle_generation;
    selection_cutoff_at := locked.requested_at;
    lease_expires_at := v_now + make_interval(secs => p_lease_seconds);
    RETURN NEXT;
    claimed := claimed + 1;
    IF claimed >= p_limit THEN RETURN; END IF;
  END LOOP;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.claim_account_exports(integer, text, integer) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.claim_account_exports(integer, text, integer) TO lifecycle_worker;--> statement-breakpoint

CREATE FUNCTION public.authorize_account_export_lease(p_request_id text, p_lease_token text)
RETURNS TABLE(owner_id text, lifecycle_generation bigint, selection_cutoff_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_request public.data_export_requests%ROWTYPE;
  v_state public.account_lifecycle_state;
  v_generation bigint;
  v_purge_due_at timestamptz;
BEGIN
  IF p_request_id IS NULL OR p_lease_token IS NULL THEN RETURN; END IF;
  SELECT requests.user_id INTO owner_id FROM public.data_export_requests requests
    WHERE requests.id = p_request_id;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM 1 FROM public."user" WHERE id = owner_id FOR SHARE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT requests.* INTO v_request FROM public.data_export_requests requests
    WHERE requests.id = p_request_id FOR SHARE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT lifecycle.state, lifecycle.generation, lifecycle.purge_due_at
    INTO v_state, v_generation, v_purge_due_at FROM public.account_lifecycles lifecycle
    WHERE lifecycle.user_id = v_request.user_id FOR SHARE;
  v_state := coalesce(v_state, 'active');
  v_generation := coalesce(v_generation, 0);
  IF v_request.status <> 'building' OR v_request.lease_token IS DISTINCT FROM p_lease_token
    OR v_request.lease_expires_at <= clock_timestamp()
    OR v_request.lifecycle_generation <> v_generation
    OR v_state NOT IN ('active', 'pending_deletion')
    OR (v_state = 'pending_deletion' AND clock_timestamp() >= v_purge_due_at) THEN RETURN; END IF;
  owner_id := v_request.user_id;
  lifecycle_generation := v_request.lifecycle_generation;
  selection_cutoff_at := v_request.requested_at;
  RETURN NEXT;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.authorize_account_export_lease(text, text) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.authorize_account_export_lease(text, text) TO lifecycle_worker;--> statement-breakpoint
