-- Durable cleanup ownership precedes every multipart initiation. Publication
-- rechecks the lease, generation, and lifecycle after the account row lock.
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
CREATE FUNCTION public.reserve_account_export_archive(p_request_id text, p_lease_token text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_owner text;
  v_request public.data_export_requests%ROWTYPE;
  v_state public.account_lifecycle_state;
  v_generation bigint;
  v_purge_due_at timestamptz;
  v_now timestamptz;
  v_task_id text;
  v_key text;
BEGIN
  IF p_request_id IS NULL OR p_lease_token IS NULL THEN RETURN NULL; END IF;
  SELECT requests.user_id INTO v_owner FROM public.data_export_requests requests WHERE requests.id = p_request_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM 1 FROM public."user" WHERE id = v_owner FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT requests.* INTO v_request FROM public.data_export_requests requests
    WHERE requests.id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_now := clock_timestamp();
  SELECT lifecycle.state, lifecycle.generation, lifecycle.purge_due_at
    INTO v_state, v_generation, v_purge_due_at FROM public.account_lifecycles lifecycle
    WHERE lifecycle.user_id = v_owner FOR SHARE;
  v_state := coalesce(v_state, 'active');
  v_generation := coalesce(v_generation, 0);
  IF v_request.status <> 'building' OR v_request.lease_token IS DISTINCT FROM p_lease_token
    OR v_request.lease_expires_at <= v_now OR v_request.lifecycle_generation <> v_generation
    OR v_state NOT IN ('active', 'pending_deletion')
    OR (v_state = 'pending_deletion' AND v_now >= v_purge_due_at) THEN RETURN NULL; END IF;

  v_task_id := 'export_cleanup_' || encode(sha256(convert_to(v_request.id || ':' || p_lease_token, 'UTF8')), 'hex');
  v_key := 'private/data-exports/v2/' || encode(sha256(convert_to(v_request.id, 'UTF8')), 'hex') || '/'
    || encode(sha256(convert_to(p_lease_token, 'UTF8')), 'hex') || '.zip';
  INSERT INTO public.data_export_object_cleanup_tasks (id, archive_object_key, status, next_attempt_at)
    VALUES (v_task_id, v_key, 'pending', v_now + interval '24 hours')
    ON CONFLICT (id) DO NOTHING;
  -- A repeated reservation must never rebind an existing cleanup task to a different object.
  PERFORM 1 FROM public.data_export_object_cleanup_tasks task
    WHERE task.id = v_task_id AND task.archive_object_key = v_key
      AND task.status = 'pending' AND task.next_attempt_at > v_now FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN v_key;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.reserve_account_export_archive(text, text) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.reserve_account_export_archive(text, text) TO lifecycle_worker;--> statement-breakpoint

CREATE FUNCTION public.publish_account_export_archive(p_request_id text, p_lease_token text, p_object_key text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_owner text;
  v_request public.data_export_requests%ROWTYPE;
  v_state public.account_lifecycle_state;
  v_generation bigint;
  v_purge_due_at timestamptz;
  v_task_id text;
  v_now timestamptz;
BEGIN
  IF p_request_id IS NULL OR p_lease_token IS NULL OR p_object_key IS NULL THEN RETURN false; END IF;
  SELECT requests.user_id INTO v_owner FROM public.data_export_requests requests WHERE requests.id = p_request_id;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public."user" WHERE id = v_owner FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT requests.* INTO v_request FROM public.data_export_requests requests
    WHERE requests.id = p_request_id FOR UPDATE;
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
  PERFORM 1 FROM public.data_export_object_cleanup_tasks task
    WHERE task.id = v_task_id AND task.archive_object_key = p_object_key
      AND task.status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.data_export_requests requests SET status = 'ready', snapshot_cutoff_at = v_request.requested_at,
    archive_object_key = p_object_key, ready_at = v_now, expires_at = v_now + interval '24 hours',
    lease_token = NULL, lease_expires_at = NULL, updated_at = v_now WHERE requests.id = p_request_id;
  UPDATE public.data_export_object_cleanup_tasks task SET next_attempt_at = v_now + interval '24 hours',
    updated_at = v_now WHERE task.id = v_task_id;
  RETURN true;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.publish_account_export_archive(text, text, text) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.publish_account_export_archive(text, text, text) TO lifecycle_worker;--> statement-breakpoint

CREATE FUNCTION public.fail_account_export_build(p_request_id text, p_lease_token text, p_failure_category text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_owner text;
  v_request public.data_export_requests%ROWTYPE;
  v_task_id text;
  v_now timestamptz;
BEGIN
  IF p_request_id IS NULL OR p_lease_token IS NULL OR p_failure_category IS NULL
    OR p_failure_category NOT IN ('size_limit', 'storage', 'source') THEN RETURN false; END IF;
  SELECT requests.user_id INTO v_owner FROM public.data_export_requests requests WHERE requests.id = p_request_id;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public."user" WHERE id = v_owner FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT requests.* INTO v_request FROM public.data_export_requests requests
    WHERE requests.id = p_request_id FOR UPDATE;
  v_now := clock_timestamp();
  IF NOT FOUND OR v_request.status <> 'building' OR v_request.lease_token IS DISTINCT FROM p_lease_token
    OR v_request.lease_expires_at <= v_now THEN RETURN false; END IF;
  v_task_id := 'export_cleanup_' || encode(sha256(convert_to(v_request.id || ':' || p_lease_token, 'UTF8')), 'hex');
  UPDATE public.data_export_object_cleanup_tasks task SET next_attempt_at = v_now,
    updated_at = v_now WHERE task.id = v_task_id AND task.status = 'pending';
  UPDATE public.data_export_requests requests SET status = 'failed', failure_category = p_failure_category,
    lease_token = NULL, lease_expires_at = NULL, updated_at = v_now WHERE requests.id = p_request_id;
  RETURN true;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.fail_account_export_build(text, text, text) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.fail_account_export_build(text, text, text) TO lifecycle_worker;--> statement-breakpoint
