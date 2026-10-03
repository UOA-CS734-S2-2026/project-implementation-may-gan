-- Archive expiry clears owner visibility before private provider cleanup.
-- Cleanup tasks stay durable for a second pass to catch late R2 completion.
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
ALTER TABLE public.data_export_object_cleanup_tasks
  ADD COLUMN IF NOT EXISTS verified_absent_at timestamptz;--> statement-breakpoint
CREATE FUNCTION public.expire_due_account_exports(p_limit integer)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  candidate record;
  v_request public.data_export_requests%ROWTYPE;
  v_task_id text;
  v_now timestamptz;
  completed integer := 0;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 25 THEN RETURN 0; END IF;
  FOR candidate IN SELECT requests.id, requests.user_id FROM public.data_export_requests requests
    WHERE requests.status = 'ready' AND requests.expires_at <= clock_timestamp()
    ORDER BY requests.expires_at, requests.id LIMIT p_limit * 4
  LOOP
    PERFORM 1 FROM public."user" WHERE id = candidate.user_id FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN CONTINUE; END IF;
    SELECT requests.* INTO v_request FROM public.data_export_requests requests WHERE requests.id = candidate.id
      AND requests.status = 'ready' AND requests.expires_at <= clock_timestamp() FOR UPDATE SKIP LOCKED;
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
REVOKE ALL ON FUNCTION public.expire_due_account_exports(integer) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.expire_due_account_exports(integer) TO lifecycle_worker;--> statement-breakpoint

CREATE FUNCTION public.claim_account_export_cleanup(p_limit integer, p_token text, p_seconds integer)
RETURNS TABLE(task_id text, object_key text, upload_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  candidate record;
  v_now timestamptz;
  claimed integer := 0;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 10
    OR p_token IS NULL OR char_length(p_token) NOT BETWEEN 1 AND 200
    OR p_seconds IS NULL OR p_seconds NOT BETWEEN 30 AND 300 THEN RETURN; END IF;
  FOR candidate IN SELECT task.id FROM public.data_export_object_cleanup_tasks task
    WHERE (task.status IN ('pending', 'failed') AND task.next_attempt_at <= clock_timestamp())
      OR (task.status = 'deleting' AND task.lease_expires_at <= clock_timestamp())
    ORDER BY task.created_at, task.id LIMIT p_limit * 4
  LOOP
    PERFORM 1 FROM public.data_export_object_cleanup_tasks task WHERE task.id = candidate.id FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN CONTINUE; END IF;
    v_now := clock_timestamp();
    -- Never delete an archive while any owner can still download it.
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
REVOKE ALL ON FUNCTION public.claim_account_export_cleanup(integer, text, integer) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.claim_account_export_cleanup(integer, text, integer) TO lifecycle_worker;--> statement-breakpoint

CREATE FUNCTION public.finish_account_export_cleanup(p_task_id text, p_token text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_task public.data_export_object_cleanup_tasks%ROWTYPE;
  v_now timestamptz;
BEGIN
  IF p_task_id IS NULL OR p_token IS NULL THEN RETURN false; END IF;
  SELECT task.* INTO v_task FROM public.data_export_object_cleanup_tasks task
    WHERE task.id = p_task_id FOR UPDATE;
  v_now := clock_timestamp();
  IF NOT FOUND OR v_task.status <> 'deleting' OR v_task.lease_token IS DISTINCT FROM p_token
    OR v_task.lease_expires_at <= v_now THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.data_export_requests requests
    WHERE requests.archive_object_key = v_task.archive_object_key
      AND requests.status = 'ready' AND requests.expires_at > v_now) THEN RETURN false; END IF;
  IF v_task.verified_absent_at IS NOT NULL
    AND v_task.verified_absent_at <= v_now - interval '24 hours' THEN
    DELETE FROM public.data_export_requests requests WHERE requests.status = 'expired'
      AND requests.archive_cleanup_task_id = p_task_id;
    DELETE FROM public.data_export_object_cleanup_tasks task WHERE task.id = p_task_id;
  ELSE
    UPDATE public.data_export_object_cleanup_tasks task SET status = 'pending', lease_token = NULL,
      lease_expires_at = NULL, verified_absent_at = coalesce(task.verified_absent_at, v_now),
      next_attempt_at = coalesce(task.verified_absent_at, v_now) + interval '24 hours',
      updated_at = v_now WHERE task.id = p_task_id;
  END IF;
  RETURN true;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.finish_account_export_cleanup(text, text) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.finish_account_export_cleanup(text, text) TO lifecycle_worker;--> statement-breakpoint

CREATE FUNCTION public.retry_account_export_cleanup(p_task_id text, p_token text, p_seconds integer)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_now timestamptz;
BEGIN
  IF p_task_id IS NULL OR p_token IS NULL OR p_seconds IS NULL
    OR p_seconds NOT BETWEEN 30 AND 86400 THEN RETURN false; END IF;
  v_now := clock_timestamp();
  UPDATE public.data_export_object_cleanup_tasks task SET status = 'failed', lease_token = NULL,
    lease_expires_at = NULL, next_attempt_at = v_now + make_interval(secs => p_seconds),
    failure_category = 'storage', updated_at = v_now
    WHERE task.id = p_task_id AND task.status = 'deleting' AND task.lease_token = p_token
      AND task.lease_expires_at > v_now;
  RETURN FOUND;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.retry_account_export_cleanup(text, text, integer) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.retry_account_export_cleanup(text, text, integer) TO lifecycle_worker;--> statement-breakpoint
