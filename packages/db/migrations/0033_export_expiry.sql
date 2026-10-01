SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint

-- One due ready archive is atomically made unreachable before cleanup can claim
-- its private key. Identity reads are unlocked, then all mutable rows use the
-- user, lifecycle, request, cleanup order.
CREATE FUNCTION public.dayli_export_expire_one()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE candidate_id text; subject text; archive_key text; cleanup_id text; lifecycle_state public.account_lifecycle_state;
BEGIN
  IF session_user <> 'lifecycle_worker' THEN RAISE EXCEPTION 'export expiry denied'; END IF;
  SELECT r.id, r.user_id INTO candidate_id, subject FROM public.data_export_requests r
  WHERE r.status='ready' AND r.expires_at <= now() ORDER BY r.expires_at LIMIT 1;
  IF candidate_id IS NULL THEN RETURN false; END IF;
  PERFORM 1 FROM public."user" u WHERE u.id=subject FOR UPDATE;
  SELECT l.state INTO lifecycle_state FROM public.account_lifecycles l WHERE l.user_id=subject FOR UPDATE;
  SELECT r.archive_object_key INTO archive_key FROM public.data_export_requests r
  WHERE r.id=candidate_id AND r.user_id=subject AND r.status='ready' AND r.expires_at <= now() FOR UPDATE;
  IF NOT FOUND OR archive_key IS NULL OR (lifecycle_state IS NOT NULL AND lifecycle_state NOT IN ('active','pending_deletion')) THEN RETURN false; END IF;
  cleanup_id := 'export-cleanup-' || candidate_id;
  INSERT INTO public.data_export_object_cleanup_tasks (id, archive_object_key, status, next_attempt_at)
  VALUES (cleanup_id, archive_key, 'pending', now()) ON CONFLICT (id) DO NOTHING;
  PERFORM 1 FROM public.data_export_object_cleanup_tasks t WHERE t.id=cleanup_id AND t.archive_object_key=archive_key FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.data_export_requests r SET status='expired', archive_object_key=null, snapshot_cutoff_at=null, ready_at=null, expires_at=null, archive_cleanup_task_id=cleanup_id, updated_at=now()
  WHERE r.id=candidate_id AND r.user_id=subject AND r.status='ready' AND r.expires_at <= now();
  RETURN FOUND;
END $$;--> statement-breakpoint

-- Recovery follows the same lock order as publication. A legacy account with
-- no lifecycle row remains eligible, and a stale building lease becomes failed
-- only after its identity and lifecycle state are locked and rechecked.
CREATE OR REPLACE FUNCTION public.dayli_export_claim(p_lease_token text, p_lease_seconds integer)
RETURNS TABLE(id text, user_id text, lifecycle_generation bigint, lease_token text, snapshot_cutoff_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE candidate_id text; subject text; state public.account_lifecycle_state; generation bigint; previous_token text;
BEGIN
  IF session_user <> 'lifecycle_worker' OR char_length(p_lease_token) < 16 OR p_lease_seconds NOT BETWEEN 30 AND 900 THEN RAISE EXCEPTION 'export worker claim denied'; END IF;
  SELECT r.id, r.user_id INTO candidate_id, subject FROM public.data_export_requests r LEFT JOIN public.account_lifecycles l ON l.user_id=r.user_id
  WHERE r.status='requested' OR (r.status='building' AND (r.lease_expires_at <= now() OR l.user_id IS NOT NULL AND (l.state NOT IN ('active','pending_deletion') OR l.generation<>r.lifecycle_generation)))
  ORDER BY r.requested_at LIMIT 1;
  IF candidate_id IS NULL THEN RETURN; END IF;
  PERFORM 1 FROM public."user" u WHERE u.id=subject FOR UPDATE;
  SELECT l.state, l.generation INTO state, generation FROM public.account_lifecycles l WHERE l.user_id=subject FOR UPDATE;
  SELECT r.lease_token INTO previous_token FROM public.data_export_requests r WHERE r.id=candidate_id AND r.user_id=subject FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.data_export_requests r WHERE r.id=candidate_id AND r.status='building' AND (r.lease_expires_at <= now() OR state IS NOT NULL AND (state NOT IN ('active','pending_deletion') OR generation<>r.lifecycle_generation))) THEN
    UPDATE public.data_export_requests r SET status='failed', snapshot_cutoff_at=null, lease_token=null, lease_expires_at=null, failure_category='storage', updated_at=now() WHERE r.id=candidate_id AND r.status='building' AND r.lease_token=previous_token;
    IF FOUND THEN UPDATE public.data_export_object_cleanup_tasks SET next_attempt_at=now(), updated_at=now() WHERE id='export-attempt-' || candidate_id || '-' || previous_token AND status IN ('pending','failed'); END IF;
    RETURN;
  END IF;
  IF state IS NOT NULL AND (state NOT IN ('active','pending_deletion') OR generation IS NULL) THEN RETURN; END IF;
  UPDATE public.data_export_requests r SET status='building', snapshot_cutoff_at=now(), lease_token=p_lease_token, lease_expires_at=now()+make_interval(secs=>p_lease_seconds), updated_at=now()
  WHERE r.id=candidate_id AND r.user_id=subject AND r.status='requested' AND (state IS NULL OR r.lifecycle_generation=generation)
  RETURNING r.id,r.user_id,r.lifecycle_generation,r.lease_token,r.snapshot_cutoff_at INTO id,user_id,lifecycle_generation,lease_token,snapshot_cutoff_at;
  IF FOUND THEN RETURN NEXT; END IF;
END $$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.dayli_export_expire_one() FROM PUBLIC, app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.dayli_export_expire_one() TO lifecycle_worker;
