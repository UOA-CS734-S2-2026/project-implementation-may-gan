-- Keep only content-free unresolved provider-failure evidence. Resolution
-- starts a fixed 30-day retention clock independent of the raw-key task.
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.data_export_cleanup_incidents (
  id text PRIMARY KEY,
  failure_category text NOT NULL,
  failure_count bigint NOT NULL DEFAULT 1,
  first_failed_at timestamptz NOT NULL,
  last_failed_at timestamptz NOT NULL,
  resolved_at timestamptz,
  expires_at timestamptz,
  CONSTRAINT data_export_cleanup_incident_digest_check CHECK (id ~ '^[0-9a-f]{64}$'),
  CONSTRAINT data_export_cleanup_incident_category_check CHECK (failure_category = 'storage'),
  CONSTRAINT data_export_cleanup_incident_count_check CHECK (failure_count BETWEEN 1 AND 9007199254740991),
  CONSTRAINT data_export_cleanup_incident_clock_check CHECK
    (last_failed_at >= first_failed_at AND (resolved_at IS NULL OR resolved_at >= last_failed_at)),
  CONSTRAINT data_export_cleanup_incident_retention_check CHECK
    ((resolved_at IS NULL AND expires_at IS NULL) OR
      (resolved_at IS NOT NULL AND expires_at = resolved_at + interval '720 hours'))
);--> statement-breakpoint
REVOKE ALL ON TABLE public.data_export_cleanup_incidents FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS data_export_cleanup_incidents_expiry_idx
  ON public.data_export_cleanup_incidents (expires_at) WHERE expires_at IS NOT NULL;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.retry_account_export_cleanup(p_task_id text, p_token text, p_seconds integer)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_now timestamptz;
  v_digest text;
BEGIN
  IF p_task_id IS NULL OR p_token IS NULL OR p_seconds IS NULL
    OR p_seconds NOT BETWEEN 30 AND 86400 THEN RETURN false; END IF;
  v_now := clock_timestamp();
  UPDATE public.data_export_object_cleanup_tasks task SET status = 'failed', lease_token = NULL,
    lease_expires_at = NULL, next_attempt_at = v_now + make_interval(secs => p_seconds),
    failure_category = 'storage', updated_at = v_now
    WHERE task.id = p_task_id AND task.status = 'deleting' AND task.lease_token = p_token
      AND task.lease_expires_at > v_now;
  IF NOT FOUND THEN RETURN false; END IF;
  v_digest := encode(sha256(convert_to(p_task_id, 'UTF8')), 'hex');
  INSERT INTO public.data_export_cleanup_incidents
    (id, failure_category, failure_count, first_failed_at, last_failed_at)
    VALUES (v_digest, 'storage', 1, v_now, v_now)
    ON CONFLICT (id) DO UPDATE SET failure_count = public.data_export_cleanup_incidents.failure_count + 1,
      last_failed_at = v_now, resolved_at = NULL, expires_at = NULL;
  RETURN true;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.retry_account_export_cleanup(text, text, integer) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.retry_account_export_cleanup(text, text, integer) TO lifecycle_worker;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.finish_account_export_cleanup(p_task_id text, p_token text)
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
  UPDATE public.data_export_cleanup_incidents incident SET resolved_at = v_now,
    expires_at = v_now + interval '720 hours'
    WHERE incident.id = encode(sha256(convert_to(p_task_id, 'UTF8')), 'hex')
      AND incident.resolved_at IS NULL;
  RETURN true;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.finish_account_export_cleanup(text, text) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.finish_account_export_cleanup(text, text) TO lifecycle_worker;--> statement-breakpoint

CREATE FUNCTION public.delete_expired_account_export_incidents(p_limit integer)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RETURN 0; END IF;
  DELETE FROM public.data_export_cleanup_incidents incident WHERE incident.id IN (
    SELECT due.id FROM public.data_export_cleanup_incidents due
      WHERE due.expires_at <= clock_timestamp() ORDER BY due.expires_at, due.id
      LIMIT p_limit FOR UPDATE SKIP LOCKED);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.delete_expired_account_export_incidents(integer) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.delete_expired_account_export_incidents(integer) TO lifecycle_worker;--> statement-breakpoint
