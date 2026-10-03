-- Renewal never revives an expired lease or extends a deletion deadline.
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
CREATE FUNCTION public.renew_account_export_lease(p_request_id text, p_lease_token text, p_seconds integer)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_owner text;
  v_request public.data_export_requests%ROWTYPE;
  v_state public.account_lifecycle_state;
  v_generation bigint;
  v_purge_due_at timestamptz;
  v_now timestamptz;
  v_next timestamptz;
BEGIN
  IF p_request_id IS NULL OR p_lease_token IS NULL OR p_seconds IS NULL
    OR p_seconds NOT BETWEEN 10 AND 300 THEN RETURN false; END IF;
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
  v_next := v_now + make_interval(secs => p_seconds);
  IF v_state = 'pending_deletion' THEN v_next := least(v_next, v_purge_due_at); END IF;
  UPDATE public.data_export_requests requests SET lease_expires_at = v_next, updated_at = v_now
    WHERE requests.id = p_request_id;
  RETURN true;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.renew_account_export_lease(text, text, integer) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.renew_account_export_lease(text, text, integer) TO lifecycle_worker;--> statement-breakpoint
