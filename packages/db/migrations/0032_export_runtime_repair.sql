SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint

-- A cleanup row is a tombstone, not a receipt. It stays after a successful
-- reconciliation so a delayed multipart completion remains discoverable.

CREATE OR REPLACE FUNCTION public.dayli_export_claim(p_lease_token text, p_lease_seconds integer)
RETURNS TABLE(id text, user_id text, lifecycle_generation bigint, lease_token text, snapshot_cutoff_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE claimed_id text; subject text;
BEGIN
  IF session_user <> 'lifecycle_worker' OR char_length(p_lease_token) < 16 OR p_lease_seconds NOT BETWEEN 30 AND 900 THEN RAISE EXCEPTION 'export worker claim denied'; END IF;
  UPDATE public.data_export_requests r SET status='failed', snapshot_cutoff_at=null, lease_token=null, lease_expires_at=null, failure_category='storage', updated_at=now() FROM public.account_lifecycles l WHERE r.user_id=l.user_id AND r.status IN ('requested','building') AND (r.lifecycle_generation<>l.generation OR l.state NOT IN ('active','pending_deletion') OR (r.status='building' AND r.lease_expires_at<=now()));
  SELECT r.id, r.user_id INTO claimed_id, subject FROM public.data_export_requests r LEFT JOIN public.account_lifecycles l ON l.user_id=r.user_id WHERE r.status='requested' AND (l.state IS NULL OR l.state IN ('active','pending_deletion')) ORDER BY r.requested_at LIMIT 1;
  IF claimed_id IS NULL THEN RETURN; END IF;
  PERFORM 1 FROM public."user" u WHERE u.id=subject FOR UPDATE;
  PERFORM 1 FROM public.account_lifecycles l WHERE l.user_id=subject FOR UPDATE;
  PERFORM 1 FROM public.data_export_requests r WHERE r.id=claimed_id AND r.user_id=subject AND r.status='requested' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE public.data_export_requests SET status='building', snapshot_cutoff_at=now(), lease_token=p_lease_token, lease_expires_at=now()+make_interval(secs=>p_lease_seconds), updated_at=now() WHERE data_export_requests.id=claimed_id AND data_export_requests.status='requested' RETURNING data_export_requests.id,data_export_requests.user_id,data_export_requests.lifecycle_generation,data_export_requests.lease_token,data_export_requests.snapshot_cutoff_at INTO id,user_id,lifecycle_generation,lease_token,snapshot_cutoff_at;
  IF FOUND THEN RETURN NEXT; END IF;
END $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.dayli_export_reserve_object(p_id text, p_lease_token text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE object_key text; task_id text; subject text; expires_at timestamptz;
BEGIN
  IF session_user <> 'lifecycle_worker' OR char_length(p_lease_token) < 16 THEN RAISE EXCEPTION 'export object reservation denied'; END IF;
  SELECT r.user_id INTO subject FROM public.data_export_requests r WHERE r.id = p_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM 1 FROM public."user" u WHERE u.id = subject FOR UPDATE;
  PERFORM 1 FROM public.account_lifecycles l WHERE l.user_id = subject FOR UPDATE;
  SELECT r.lease_expires_at INTO expires_at FROM public.data_export_requests r LEFT JOIN public.account_lifecycles l ON l.user_id = r.user_id WHERE r.id = p_id AND r.user_id = subject AND r.status = 'building' AND r.lease_token = p_lease_token AND r.lease_expires_at > now() AND (l.state IS NULL OR (l.state IN ('active', 'pending_deletion') AND l.generation = r.lifecycle_generation)) FOR UPDATE OF r;
  IF NOT FOUND THEN RETURN NULL; END IF;
  object_key := 'private/data-exports/' || p_id || '/' || p_lease_token || '.zip';
  task_id := 'export-attempt-' || p_id || '-' || p_lease_token;
  INSERT INTO public.data_export_object_cleanup_tasks (id, archive_object_key, status, next_attempt_at) VALUES (task_id, object_key, 'pending', expires_at) ON CONFLICT (id) DO NOTHING;
  RETURN object_key;
END $$;--> statement-breakpoint

CREATE FUNCTION public.dayli_export_record_multipart_upload(p_id text, p_lease_token text, p_upload_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE subject text; task_id text;
BEGIN
  IF session_user <> 'lifecycle_worker' OR char_length(p_lease_token) < 16 OR char_length(p_upload_id) NOT BETWEEN 1 AND 1024 THEN RAISE EXCEPTION 'export multipart recording denied'; END IF;
  SELECT r.user_id INTO subject FROM public.data_export_requests r WHERE r.id = p_id;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public."user" u WHERE u.id = subject FOR UPDATE;
  PERFORM 1 FROM public.account_lifecycles l WHERE l.user_id = subject FOR UPDATE;
  PERFORM 1 FROM public.data_export_requests r LEFT JOIN public.account_lifecycles l ON l.user_id=r.user_id WHERE r.id=p_id AND r.user_id=subject AND r.status='building' AND r.lease_token=p_lease_token AND r.lease_expires_at>now() AND (l.state IS NULL OR (l.state IN ('active','pending_deletion') AND l.generation=r.lifecycle_generation)) FOR UPDATE OF r;
  IF NOT FOUND THEN RETURN false; END IF;
  task_id := 'export-attempt-' || p_id || '-' || p_lease_token;
  UPDATE public.data_export_object_cleanup_tasks SET multipart_upload_id=p_upload_id, updated_at=now() WHERE id=task_id AND archive_object_key='private/data-exports/' || p_id || '/' || p_lease_token || '.zip';
  RETURN FOUND;
END $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.dayli_export_publish(p_id text, p_lease_token text, p_generation bigint, p_archive_key text, p_cutoff timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE lifecycle_state public.account_lifecycle_state; lifecycle_generation bigint; subject text; task_id text;
BEGIN
  IF session_user <> 'lifecycle_worker' OR char_length(p_lease_token) < 16 THEN RAISE EXCEPTION 'export worker publication denied'; END IF;
  IF p_archive_key <> 'private/data-exports/' || p_id || '/' || p_lease_token || '.zip' THEN RETURN false; END IF;
  SELECT r.user_id INTO subject FROM public.data_export_requests r WHERE r.id = p_id;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public."user" u WHERE u.id = subject FOR UPDATE;
  SELECT l.state, l.generation INTO lifecycle_state, lifecycle_generation FROM public.account_lifecycles l WHERE l.user_id = subject FOR UPDATE;
  PERFORM 1 FROM public.data_export_requests r WHERE r.id=p_id AND r.user_id=subject FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  task_id := 'export-attempt-' || p_id || '-' || p_lease_token;
  PERFORM 1 FROM public.data_export_object_cleanup_tasks t WHERE t.id = task_id AND t.archive_object_key = p_archive_key FOR UPDATE;
  IF NOT FOUND OR (lifecycle_state IS NOT NULL AND (lifecycle_state NOT IN ('active', 'pending_deletion') OR lifecycle_generation <> p_generation)) THEN RETURN false; END IF;
  UPDATE public.data_export_requests r SET status = 'ready', archive_object_key = p_archive_key, ready_at = now(), expires_at = now() + interval '24 hours', lease_token = null, lease_expires_at = null, updated_at = now() WHERE r.id = p_id AND r.status = 'building' AND r.lease_token = p_lease_token AND r.lease_expires_at > now() AND r.lifecycle_generation = p_generation;
  IF NOT FOUND THEN RETURN false; END IF;
  -- A published object is tracked by its request. Its pre-creation tombstone is
  -- no longer needed and cannot be a target for a stale completion.
  DELETE FROM public.data_export_object_cleanup_tasks WHERE id = task_id AND archive_object_key = p_archive_key;
  RETURN true;
END $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.dayli_export_fail(p_id text, p_lease_token text, p_category text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE subject text; task_id text;
BEGIN
  IF session_user <> 'lifecycle_worker' OR char_length(p_lease_token) < 16 OR p_category NOT IN ('size_limit', 'storage', 'source') THEN RAISE EXCEPTION 'export worker failure denied'; END IF;
  SELECT r.user_id INTO subject FROM public.data_export_requests r WHERE r.id = p_id;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public."user" u WHERE u.id = subject FOR UPDATE;
  PERFORM 1 FROM public.account_lifecycles l WHERE l.user_id = subject FOR UPDATE;
  UPDATE public.data_export_requests r SET status = 'failed', snapshot_cutoff_at = null, failure_category = p_category, lease_token = null, lease_expires_at = null, updated_at = now() FROM public.account_lifecycles l WHERE r.id = p_id AND r.user_id=subject AND r.status = 'building' AND r.lease_token = p_lease_token AND r.lease_expires_at > now() AND l.user_id = r.user_id AND l.generation = r.lifecycle_generation AND l.state IN ('active', 'pending_deletion');
  IF FOUND THEN task_id := 'export-attempt-' || p_id || '-' || p_lease_token; UPDATE public.data_export_object_cleanup_tasks SET next_attempt_at = now(), updated_at = now() WHERE id = task_id AND status IN ('pending', 'failed'); END IF;
  RETURN FOUND;
END $$;--> statement-breakpoint

DROP FUNCTION public.dayli_export_cleanup_claim(text, integer);--> statement-breakpoint
CREATE FUNCTION public.dayli_export_cleanup_claim(p_lease_token text, p_lease_seconds integer)
RETURNS TABLE(id text, archive_object_key text, lease_token text, multipart_upload_id text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF session_user <> 'lifecycle_worker' OR char_length(p_lease_token) < 16 OR p_lease_seconds NOT BETWEEN 30 AND 900 THEN RAISE EXCEPTION 'export cleanup claim denied'; END IF;
  RETURN QUERY WITH candidate AS (
    SELECT t.id FROM public.data_export_object_cleanup_tasks t
    WHERE ((t.status IN ('pending','failed') AND t.next_attempt_at <= now()) OR (t.status='deleting' AND t.lease_expires_at <= now()))
      AND NOT EXISTS (SELECT 1 FROM public.data_export_requests r WHERE t.id = 'export-attempt-' || r.id || '-' || r.lease_token AND r.status = 'building' AND r.lease_expires_at > now())
    ORDER BY coalesce(t.next_attempt_at, t.lease_expires_at) FOR UPDATE SKIP LOCKED LIMIT 1
  ) UPDATE public.data_export_object_cleanup_tasks t SET status='deleting', lease_token=p_lease_token, lease_expires_at=now()+make_interval(secs=>p_lease_seconds), next_attempt_at=null, failure_category=null, attempt_count=t.attempt_count+1, updated_at=now() FROM candidate WHERE t.id=candidate.id RETURNING t.id,t.archive_object_key,t.lease_token,t.multipart_upload_id;
END $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.dayli_export_cleanup_complete(p_id text, p_lease_token text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF session_user <> 'lifecycle_worker' OR char_length(p_lease_token) < 16 THEN RAISE EXCEPTION 'export cleanup completion denied'; END IF;
  UPDATE public.data_export_object_cleanup_tasks SET status='pending', lease_token=null, lease_expires_at=null, next_attempt_at=now()+interval '5 minutes', failure_category=null, updated_at=now() WHERE id=p_id AND status='deleting' AND lease_token=p_lease_token AND lease_expires_at > now();
  RETURN FOUND;
END $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.dayli_export_cleanup_retry(p_id text, p_lease_token text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF session_user <> 'lifecycle_worker' OR char_length(p_lease_token) < 16 THEN RAISE EXCEPTION 'export cleanup retry denied'; END IF;
  UPDATE public.data_export_object_cleanup_tasks SET status='failed', lease_token=null, lease_expires_at=null, failure_category='storage', next_attempt_at=now()+interval '5 minutes', updated_at=now() WHERE id=p_id AND status='deleting' AND lease_token=p_lease_token AND lease_expires_at > now();
  RETURN FOUND;
END $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.dayli_export_cancel_for_purge(p_user_id text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE cleanup_id text; archive_key text; request_id text; total integer := 0;
BEGIN
  IF session_user <> 'lifecycle_worker' THEN RAISE EXCEPTION 'export purge cancellation denied'; END IF;
  PERFORM 1 FROM public."user" u WHERE u.id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;
  PERFORM 1 FROM public.account_lifecycles l WHERE l.user_id=p_user_id FOR UPDATE;
  FOR request_id, archive_key IN SELECT id, archive_object_key FROM public.data_export_requests WHERE user_id=p_user_id AND status='ready' FOR UPDATE LOOP
    cleanup_id := 'export-cleanup-' || request_id;
    INSERT INTO public.data_export_object_cleanup_tasks (id, archive_object_key, status, next_attempt_at) VALUES (cleanup_id, archive_key, 'pending', now()) ON CONFLICT (id) DO NOTHING;
    UPDATE public.data_export_requests SET status='expired', archive_object_key=null, snapshot_cutoff_at=null, ready_at=null, expires_at=null, archive_cleanup_task_id=cleanup_id, updated_at=now() WHERE id=request_id;
    total := total+1;
  END LOOP;
  UPDATE public.data_export_requests SET status='cancelled', snapshot_cutoff_at=null, lease_token=null, lease_expires_at=null, updated_at=now() WHERE user_id=p_user_id AND status IN ('requested','building');
  RETURN total;
END $$;--> statement-breakpoint

-- Keep records small before JSONB leaves PostgreSQL. Attachment references are
-- untrusted JSON, so both their count and serialized size are constrained.
CREATE OR REPLACE FUNCTION public.dayli_export_bounded_text(p_value text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
BEGIN
  IF p_value IS NOT NULL AND octet_length(p_value) > 4096 THEN RAISE EXCEPTION 'export field exceeds 4096 bytes'; END IF;
  RETURN p_value;
END $$;--> statement-breakpoint

CREATE FUNCTION public.dayli_export_checked_attachment_refs(p_value jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
BEGIN
  IF jsonb_typeof(p_value) <> 'array' OR jsonb_array_length(p_value) > 16 OR octet_length(p_value::text) > 32768 THEN RAISE EXCEPTION 'export attachment references exceed record bounds'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_value) x WHERE jsonb_typeof(x.value) <> 'object' OR octet_length(coalesce(x.value->>'media_id','')) > 4096 OR octet_length(coalesce(x.value->>'status','')) > 4096) THEN RAISE EXCEPTION 'export attachment reference exceeds record bounds'; END IF;
  RETURN p_value;
END $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.dayli_export_source_page(p_id text, p_lease_token text, p_kind text, p_cursor text)
RETURNS TABLE(record jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE subject text; cutoff timestamptz;
BEGIN
  IF session_user <> 'lifecycle_worker' OR char_length(p_lease_token) < 16 OR p_kind NOT IN ('profile', 'journals', 'revisions', 'notes', 'messages') THEN RAISE EXCEPTION 'export source denied'; END IF;
  SELECT r.user_id, r.snapshot_cutoff_at INTO subject, cutoff FROM public.data_export_requests r LEFT JOIN public.account_lifecycles l ON l.user_id=r.user_id WHERE r.id=p_id AND r.status='building' AND r.lease_token=p_lease_token AND r.lease_expires_at>now() AND r.snapshot_cutoff_at IS NOT NULL AND (l.state IS NULL OR (l.state IN ('active','pending_deletion') AND l.generation=r.lifecycle_generation)); IF NOT FOUND THEN RETURN; END IF;
  IF p_kind='profile' THEN RETURN QUERY SELECT jsonb_build_object('type','account_profile','name',public.dayli_export_bounded_text(u.name),'username',public.dayli_export_bounded_text(u.username),'displayUsername',public.dayli_export_bounded_text(u.display_username),'bio',public.dayli_export_bounded_text(u.bio),'mbti',public.dayli_export_bounded_text(u.mbti),'whatIDo',public.dayli_export_bounded_text(u.what_i_do),'listeningTo',public.dayli_export_bounded_text(u.listening_to),'profileVisibility',u.profile_visibility,'email',public.dayli_export_bounded_text(u.email),'createdAt',u.created_at) FROM public."user" u WHERE u.id=subject;
  ELSIF p_kind='journals' THEN RETURN QUERY SELECT jsonb_build_object('type','journal','id',p.id,'localDate',p.local_date,'reflectiveAnswer',public.dayli_export_bounded_text(p.reflective_answer),'caption',public.dayli_export_bounded_text(p.caption),'rating',p.rating,'audience',p.audience,'acceptedAt',p.accepted_at,'releasedAt',p.released_at,'createdAt',p.created_at,'updatedAt',p.updated_at) FROM public.posts p WHERE p.author_id=subject AND p.id>p_cursor AND p.created_at<=cutoff ORDER BY p.id LIMIT 100;
  ELSIF p_kind='revisions' THEN RETURN QUERY SELECT jsonb_build_object('type','journal_revision','id',r.id,'postId',r.post_id,'revisionNumber',r.revision_number,'previousReflectiveAnswer',public.dayli_export_bounded_text(r.previous_reflective_answer),'previousCaption',public.dayli_export_bounded_text(r.previous_caption),'previousRating',r.previous_rating,'previousAudience',r.previous_audience,'previousPromptId',r.previous_prompt_id,'previousAttachmentRefs',(SELECT coalesce(jsonb_agg(jsonb_build_object('media_id',public.dayli_export_bounded_text(x.value->>'media_id'),'attachment_order',(x.value->>'attachment_order')::integer,'status',public.dayli_export_bounded_text(x.value->>'status'))),'[]'::jsonb) FROM jsonb_array_elements(public.dayli_export_checked_attachment_refs(r.previous_attachment_refs)) x),'createdAt',r.created_at) FROM public.post_revisions r JOIN public.posts p ON p.id=r.post_id WHERE p.author_id=subject AND r.id>p_cursor AND r.created_at<=cutoff ORDER BY r.id LIMIT 100;
  ELSIF p_kind='notes' THEN RETURN QUERY SELECT jsonb_build_object('type','private_note','id',n.id,'postId',n.post_id,'note',public.dayli_export_bounded_text(n.note),'submittedAt',n.submitted_at,'availableOn',n.available_on) FROM public.tomorrow_notes n WHERE n.author_id=subject AND n.id>p_cursor AND n.submitted_at<=cutoff ORDER BY n.id LIMIT 100;
  ELSE RETURN QUERY SELECT jsonb_build_object('type','authored_message','id',m.id,'conversationId',m.conversation_id,'sequence',m.sequence,'clientMessageId',public.dayli_export_bounded_text(m.client_message_id),'body',public.dayli_export_bounded_text(m.body),'createdAt',m.created_at,'editedAt',m.edited_at,'unsentAt',m.unsent_at) FROM public.messages m JOIN public.messaging_participants mp ON mp.id=m.sender_participant_id WHERE mp.user_id=subject AND m.id>p_cursor AND m.created_at<=cutoff ORDER BY m.id LIMIT 100;
  END IF;
END $$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.dayli_export_checked_attachment_refs(jsonb), public.dayli_export_record_multipart_upload(text,text,text) FROM PUBLIC, app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.dayli_export_record_multipart_upload(text,text,text) TO lifecycle_worker;
