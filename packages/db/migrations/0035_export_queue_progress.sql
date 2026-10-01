SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint

-- Scan a bounded candidate set. A stale or ineligible oldest row cannot prevent
-- a later ready archive or legacy requested export from progressing.
CREATE OR REPLACE FUNCTION public.dayli_export_expire_one()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE candidate record; archive_key text; cleanup_id text;
BEGIN
  IF session_user <> 'lifecycle_worker' THEN RAISE EXCEPTION 'export expiry denied'; END IF;
  FOR candidate IN SELECT r.id, r.user_id FROM public.data_export_requests r WHERE r.status='ready' AND r.expires_at<=now() ORDER BY r.expires_at LIMIT 32 LOOP
    PERFORM 1 FROM public."user" u WHERE u.id=candidate.user_id FOR UPDATE;
    PERFORM 1 FROM public.account_lifecycles l WHERE l.user_id=candidate.user_id FOR UPDATE;
    SELECT r.archive_object_key INTO archive_key FROM public.data_export_requests r WHERE r.id=candidate.id AND r.user_id=candidate.user_id AND r.status='ready' AND r.expires_at<=now() FOR UPDATE;
    IF NOT FOUND OR archive_key IS NULL THEN CONTINUE; END IF;
    cleanup_id := 'export-cleanup-' || candidate.id;
    INSERT INTO public.data_export_object_cleanup_tasks (id,archive_object_key,status,next_attempt_at) VALUES (cleanup_id,archive_key,'pending',now()) ON CONFLICT (id) DO NOTHING;
    PERFORM 1 FROM public.data_export_object_cleanup_tasks t WHERE t.id=cleanup_id AND t.archive_object_key=archive_key FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;
    UPDATE public.data_export_requests r SET status='expired',archive_object_key=null,snapshot_cutoff_at=null,ready_at=null,expires_at=null,archive_cleanup_task_id=cleanup_id,updated_at=now() WHERE r.id=candidate.id AND r.status='ready' AND r.expires_at<=now();
    IF FOUND THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
END $$;--> statement-breakpoint

-- Do not serialize untrusted attachment JSON. Validate scalar members and
-- rebuild the whitelisted representation before its bounded serialization.
CREATE OR REPLACE FUNCTION public.dayli_export_checked_attachment_refs(p_value jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE rebuilt jsonb;
BEGIN
  IF jsonb_typeof(p_value)<>'array' OR jsonb_array_length(p_value)>8 THEN RAISE EXCEPTION 'export attachment references exceed record bounds'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_value) x WHERE jsonb_typeof(x.value)<>'object' OR (x.value ? 'media_id' AND jsonb_typeof(x.value->'media_id')<>'string') OR (x.value ? 'status' AND jsonb_typeof(x.value->'status')<>'string') OR (x.value ? 'attachment_order' AND jsonb_typeof(x.value->'attachment_order')<>'number')) THEN RAISE EXCEPTION 'export attachment reference exceeds record bounds'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('media_id',public.dayli_export_bounded_text(x.value->>'media_id'),'attachment_order',(x.value->>'attachment_order')::integer,'status',public.dayli_export_bounded_text(x.value->>'status'))),'[]'::jsonb) INTO rebuilt FROM jsonb_array_elements(p_value) x;
  IF octet_length(rebuilt::text)>8192 THEN RAISE EXCEPTION 'export attachment references exceed record bounds'; END IF;
  RETURN rebuilt;
END $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.dayli_export_claim(p_lease_token text, p_lease_seconds integer)
RETURNS TABLE(id text,user_id text,lifecycle_generation bigint,lease_token text,snapshot_cutoff_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE candidate record; state public.account_lifecycle_state; generation bigint; previous_token text;
BEGIN
  IF session_user <> 'lifecycle_worker' OR char_length(p_lease_token)<16 OR p_lease_seconds NOT BETWEEN 30 AND 900 THEN RAISE EXCEPTION 'export worker claim denied'; END IF;
  FOR candidate IN SELECT r.id,r.user_id FROM public.data_export_requests r LEFT JOIN public.account_lifecycles l ON l.user_id=r.user_id WHERE r.status='requested' OR (r.status='building' AND (r.lease_expires_at<=now() OR (l.user_id IS NOT NULL AND (l.state NOT IN ('active','pending_deletion') OR l.generation<>r.lifecycle_generation)))) ORDER BY r.requested_at LIMIT 32 LOOP
    PERFORM 1 FROM public."user" u WHERE u.id=candidate.user_id FOR UPDATE;
    SELECT l.state,l.generation INTO state,generation FROM public.account_lifecycles l WHERE l.user_id=candidate.user_id FOR UPDATE;
    SELECT r.lease_token INTO previous_token FROM public.data_export_requests r WHERE r.id=candidate.id AND r.user_id=candidate.user_id FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM public.data_export_requests r WHERE r.id=candidate.id AND r.status='building' AND (r.lease_expires_at<=now() OR (state IS NOT NULL AND (state NOT IN ('active','pending_deletion') OR generation<>r.lifecycle_generation)))) THEN
      UPDATE public.data_export_requests r SET status='failed',snapshot_cutoff_at=null,lease_token=null,lease_expires_at=null,failure_category='storage',updated_at=now() WHERE r.id=candidate.id AND r.status='building' AND r.lease_token=previous_token;
      IF FOUND THEN UPDATE public.data_export_object_cleanup_tasks SET next_attempt_at=now(),updated_at=now() WHERE id='export-attempt-' || candidate.id || '-' || previous_token AND status IN ('pending','failed'); END IF;
      CONTINUE;
    END IF;
    IF state IS NOT NULL AND (state NOT IN ('active','pending_deletion') OR generation IS NULL) THEN CONTINUE; END IF;
    UPDATE public.data_export_requests r SET status='building',snapshot_cutoff_at=now(),lease_token=p_lease_token,lease_expires_at=now()+make_interval(secs=>p_lease_seconds),updated_at=now() WHERE r.id=candidate.id AND r.user_id=candidate.user_id AND r.status='requested' AND (state IS NULL OR r.lifecycle_generation=generation) RETURNING r.id,r.user_id,r.lifecycle_generation,r.lease_token,r.snapshot_cutoff_at INTO id,user_id,lifecycle_generation,lease_token,snapshot_cutoff_at;
    IF FOUND THEN RETURN NEXT; RETURN; END IF;
  END LOOP;
END $$;--> statement-breakpoint
