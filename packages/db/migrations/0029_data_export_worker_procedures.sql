-- The protected migrator applies this forward-only change atomically.
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint

-- These narrow security-definer functions are the only planned direct access
-- path for app and lifecycle_worker once the API and offline dispatcher are
-- switched to them. No function accepts an archive key from app.
CREATE FUNCTION public.dayli_export_claim(p_lease_token text, p_lease_seconds integer)
RETURNS TABLE(id text, user_id text, lifecycle_generation bigint, lease_token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  claimed_id text;
BEGIN
  IF session_user <> 'lifecycle_worker' OR char_length(p_lease_token) < 16 OR p_lease_seconds NOT BETWEEN 30 AND 900 THEN
    RAISE EXCEPTION 'export worker claim denied';
  END IF;
  SELECT r.id INTO claimed_id
  FROM public.data_export_requests r
  LEFT JOIN public.account_lifecycles l ON l.user_id = r.user_id
  WHERE r.status = 'requested'
    AND (l.state IS NULL OR l.state IN ('active', 'pending_deletion'))
  ORDER BY r.requested_at
  FOR UPDATE OF r SKIP LOCKED
  LIMIT 1;
  IF claimed_id IS NULL THEN RETURN; END IF;
  UPDATE public.data_export_requests
  SET status = 'building', lease_token = p_lease_token,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds), updated_at = now()
  WHERE data_export_requests.id = claimed_id
  RETURNING data_export_requests.id, data_export_requests.user_id, data_export_requests.lifecycle_generation, data_export_requests.lease_token
  INTO id, user_id, lifecycle_generation, lease_token;
  RETURN NEXT;
END $$;--> statement-breakpoint

CREATE FUNCTION public.dayli_export_publish(p_id text, p_lease_token text, p_generation bigint, p_archive_key text, p_cutoff timestamptz)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  state public.account_lifecycle_state;
  generation bigint;
BEGIN
  IF session_user <> 'lifecycle_worker' OR char_length(p_lease_token) < 16 OR char_length(p_archive_key) NOT BETWEEN 1 AND 1024 THEN
    RAISE EXCEPTION 'export worker publication denied';
  END IF;
  SELECT l.state, l.generation INTO state, generation FROM public.account_lifecycles l
  JOIN public.data_export_requests r ON r.user_id = l.user_id
  WHERE r.id = p_id FOR UPDATE OF l, r;
  IF NOT FOUND OR state NOT IN ('active', 'pending_deletion') OR generation <> p_generation THEN RETURN false; END IF;
  UPDATE public.data_export_requests
  SET status = 'ready', snapshot_cutoff_at = p_cutoff, archive_object_key = p_archive_key,
      ready_at = now(), expires_at = now() + interval '24 hours', lease_token = null, lease_expires_at = null, updated_at = now()
  WHERE id = p_id AND status = 'building' AND lease_token = p_lease_token AND lifecycle_generation = p_generation;
  RETURN FOUND;
END $$;--> statement-breakpoint

CREATE FUNCTION public.dayli_export_fail(p_id text, p_lease_token text, p_category text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF session_user <> 'lifecycle_worker' OR char_length(p_lease_token) < 16 OR p_category NOT IN ('size_limit', 'storage', 'source') THEN
    RAISE EXCEPTION 'export worker failure denied';
  END IF;
  UPDATE public.data_export_requests
  SET status = 'failed', failure_category = p_category, lease_token = null, lease_expires_at = null, updated_at = now()
  WHERE id = p_id AND status = 'building' AND lease_token = p_lease_token;
  RETURN FOUND;
END $$;--> statement-breakpoint

-- #161 can call this before any physical deletion. It durably records every
-- ready archive key before the request row can be cascaded away.
CREATE FUNCTION public.dayli_export_cancel_for_purge(p_user_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  cleanup_id text;
  archive_key text;
  request_id text;
  total integer := 0;
BEGIN
  IF session_user <> 'lifecycle_worker' THEN RAISE EXCEPTION 'export purge cancellation denied'; END IF;
  FOR request_id, archive_key IN
    SELECT id, archive_object_key FROM public.data_export_requests
    WHERE user_id = p_user_id AND status = 'ready' FOR UPDATE
  LOOP
    cleanup_id := 'export-cleanup-' || request_id;
    INSERT INTO public.data_export_object_cleanup_tasks (id, archive_object_key, status, next_attempt_at)
    VALUES (cleanup_id, archive_key, 'pending', now()) ON CONFLICT (id) DO NOTHING;
    UPDATE public.data_export_requests
    SET status = 'expired', archive_object_key = null, snapshot_cutoff_at = null, ready_at = null, expires_at = null,
        archive_cleanup_task_id = cleanup_id, updated_at = now()
    WHERE id = request_id;
    total := total + 1;
  END LOOP;
  UPDATE public.data_export_requests SET status = 'cancelled', updated_at = now()
  WHERE user_id = p_user_id AND status IN ('requested', 'building');
  RETURN total;
END $$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.dayli_export_claim(text, integer), public.dayli_export_publish(text, text, bigint, text, timestamptz), public.dayli_export_fail(text, text, text), public.dayli_export_cancel_for_purge(text) FROM PUBLIC, app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.dayli_export_claim(text, integer), public.dayli_export_publish(text, text, bigint, text, timestamptz), public.dayli_export_fail(text, text, text), public.dayli_export_cancel_for_purge(text) TO lifecycle_worker;