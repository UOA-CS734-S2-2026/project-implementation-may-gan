-- Staging proof functions constrain worker claims to one synthetic owner.
-- The existing production functions and grants remain unchanged.
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
CREATE FUNCTION public.claim_account_exports_for_owner(p_owner_id text, p_limit integer, p_lease_token text, p_lease_seconds integer)
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
  IF p_owner_id IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 10
    OR p_lease_token IS NULL OR char_length(p_lease_token) NOT BETWEEN 1 AND 200
    OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 10 AND 300 THEN RETURN; END IF;

  FOR candidate IN SELECT requests.id, requests.user_id
    FROM public.data_export_requests requests
    WHERE requests.user_id = p_owner_id AND (requests.status = 'requested'
      OR (requests.status = 'building' AND requests.lease_expires_at <= clock_timestamp()))
    ORDER BY requests.requested_at, requests.id LIMIT p_limit * 4
  LOOP
    PERFORM 1 FROM public."user" WHERE id = candidate.user_id FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN CONTINUE; END IF;
    SELECT requests.* INTO locked FROM public.data_export_requests requests
      WHERE requests.id = candidate.id AND requests.user_id = p_owner_id
        AND (requests.status = 'requested'
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
REVOKE ALL ON FUNCTION public.claim_account_exports_for_owner(text, integer, text, integer) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.claim_account_exports_for_owner(text, integer, text, integer) TO lifecycle_worker;--> statement-breakpoint

CREATE FUNCTION public.expire_due_account_exports_for_owner(p_owner_id text, p_limit integer)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  candidate record;
  v_request public.data_export_requests%ROWTYPE;
  v_task_id text;
  v_now timestamptz;
  completed integer := 0;
BEGIN
  IF p_owner_id IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 25 THEN RETURN 0; END IF;
  FOR candidate IN SELECT requests.id, requests.user_id FROM public.data_export_requests requests
    WHERE requests.user_id = p_owner_id AND requests.status = 'ready'
      AND requests.expires_at <= clock_timestamp()
    ORDER BY requests.expires_at, requests.id LIMIT p_limit * 4
  LOOP
    PERFORM 1 FROM public."user" WHERE id = candidate.user_id FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN CONTINUE; END IF;
    SELECT requests.* INTO v_request FROM public.data_export_requests requests WHERE requests.id = candidate.id
      AND requests.user_id = p_owner_id AND requests.status = 'ready'
      AND requests.expires_at <= clock_timestamp() FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN CONTINUE; END IF;
    SELECT task.id INTO v_task_id FROM public.data_export_object_cleanup_tasks task
      WHERE task.archive_object_key = v_request.archive_object_key
      ORDER BY task.created_at DESC, task.id DESC LIMIT 1 FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN CONTINUE; END IF;
    v_now := clock_timestamp();
    UPDATE public.data_export_requests requests SET status = 'expired', snapshot_cutoff_at = NULL,
      archive_object_key = NULL, ready_at = NULL, expires_at = NULL,
      archive_cleanup_task_id = v_task_id, updated_at = v_now WHERE requests.id = candidate.id;
    UPDATE public.data_export_object_cleanup_tasks task SET next_attempt_at = least(task.next_attempt_at, v_now),
      updated_at = v_now WHERE task.id = v_task_id AND task.status IN ('pending', 'failed');
    completed := completed + 1;
    IF completed >= p_limit THEN EXIT; END IF;
  END LOOP;
  RETURN completed;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.expire_due_account_exports_for_owner(text, integer) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.expire_due_account_exports_for_owner(text, integer) TO lifecycle_worker;--> statement-breakpoint

CREATE FUNCTION public.claim_account_export_cleanup_for_owner(p_owner_id text, p_limit integer, p_token text, p_seconds integer)
RETURNS TABLE(task_id text, object_key text, upload_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  candidate record;
  v_now timestamptz;
  claimed integer := 0;
BEGIN
  IF p_owner_id IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 10
    OR p_token IS NULL OR char_length(p_token) NOT BETWEEN 1 AND 200
    OR p_seconds IS NULL OR p_seconds NOT BETWEEN 30 AND 300 THEN RETURN; END IF;
  FOR candidate IN SELECT task.id FROM public.data_export_object_cleanup_tasks task
    WHERE ((task.status IN ('pending', 'failed') AND task.next_attempt_at <= clock_timestamp())
      OR (task.status = 'deleting' AND task.lease_expires_at <= clock_timestamp()))
      AND task.archive_object_key LIKE 'private/data-exports/v2/%'
      AND EXISTS (SELECT 1 FROM public.data_export_requests requests
        WHERE requests.user_id = p_owner_id
          AND split_part(task.archive_object_key, '/', 4) =
            encode(sha256(convert_to(requests.id, 'UTF8')), 'hex'))
    ORDER BY task.created_at, task.id LIMIT p_limit * 4
  LOOP
    PERFORM 1 FROM public.data_export_object_cleanup_tasks task WHERE task.id = candidate.id FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN CONTINUE; END IF;
    v_now := clock_timestamp();
    IF EXISTS (SELECT 1 FROM public.data_export_requests requests
      WHERE requests.archive_object_key = (SELECT current.archive_object_key
        FROM public.data_export_object_cleanup_tasks current WHERE current.id = candidate.id)
      AND requests.status = 'ready' AND requests.expires_at > v_now) THEN CONTINUE; END IF;
    UPDATE public.data_export_object_cleanup_tasks task SET status = 'deleting', lease_token = p_token,
      lease_expires_at = v_now + make_interval(secs => p_seconds), next_attempt_at = NULL,
      failure_category = NULL, attempt_count = task.attempt_count + 1, updated_at = v_now
      WHERE task.id = candidate.id AND ((task.status IN ('pending', 'failed') AND task.next_attempt_at <= v_now)
        OR (task.status = 'deleting' AND task.lease_expires_at <= v_now))
      RETURNING task.id, task.archive_object_key, task.upload_id INTO task_id, object_key, upload_id;
    IF NOT FOUND THEN CONTINUE; END IF;
    RETURN NEXT;
    claimed := claimed + 1;
    IF claimed >= p_limit THEN RETURN; END IF;
  END LOOP;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.claim_account_export_cleanup_for_owner(text, integer, text, integer) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.claim_account_export_cleanup_for_owner(text, integer, text, integer) TO lifecycle_worker;--> statement-breakpoint
