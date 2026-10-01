SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint

CREATE FUNCTION public.dayli_export_bounded_text(p_value text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
BEGIN
  IF p_value IS NOT NULL AND octet_length(p_value) > 65536 THEN RAISE EXCEPTION 'export field exceeds 65536 bytes'; END IF;
  RETURN p_value;
END $$;--> statement-breakpoint

-- User first is the established deletion lock order. It serializes both legacy
-- accounts without a lifecycle row and accounts with a lifecycle row.
CREATE OR REPLACE FUNCTION public.dayli_export_reserve_object(p_id text, p_lease_token text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE object_key text; task_id text; subject text; expires_at timestamptz;
BEGIN
  IF session_user <> 'lifecycle_worker' OR char_length(p_lease_token) < 16 THEN RAISE EXCEPTION 'export object reservation denied'; END IF;
  SELECT r.user_id, r.lease_expires_at INTO subject, expires_at FROM public.data_export_requests r WHERE r.id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM 1 FROM public."user" u WHERE u.id = subject FOR UPDATE;
  PERFORM 1 FROM public.account_lifecycles l WHERE l.user_id = subject FOR UPDATE;
  PERFORM 1 FROM public.data_export_requests r LEFT JOIN public.account_lifecycles l ON l.user_id = r.user_id WHERE r.id = p_id AND r.status = 'building' AND r.lease_token = p_lease_token AND r.lease_expires_at > now() AND (l.state IS NULL OR (l.state IN ('active', 'pending_deletion') AND l.generation = r.lifecycle_generation));
  IF NOT FOUND THEN RETURN NULL; END IF;
  object_key := 'private/data-exports/' || p_id || '/' || p_lease_token || '.zip'; task_id := 'export-attempt-' || p_id || '-' || p_lease_token;
  -- A live worker owns this key. Retry eligibility starts only after its lease.
  INSERT INTO public.data_export_object_cleanup_tasks (id, archive_object_key, status, next_attempt_at) VALUES (task_id, object_key, 'pending', expires_at) ON CONFLICT (id) DO NOTHING;
  RETURN object_key;
END $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.dayli_export_publish(p_id text, p_lease_token text, p_generation bigint, p_archive_key text, p_cutoff timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE lifecycle_state public.account_lifecycle_state; lifecycle_generation bigint; subject text; task_id text;
BEGIN
  IF session_user <> 'lifecycle_worker' OR char_length(p_lease_token) < 16 THEN RAISE EXCEPTION 'export worker publication denied'; END IF;
  IF p_archive_key <> 'private/data-exports/' || p_id || '/' || p_lease_token || '.zip' THEN RETURN false; END IF;
  SELECT r.user_id INTO subject FROM public.data_export_requests r WHERE r.id = p_id FOR UPDATE; IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public."user" u WHERE u.id = subject FOR UPDATE;
  SELECT l.state, l.generation INTO lifecycle_state, lifecycle_generation FROM public.account_lifecycles l WHERE l.user_id = subject FOR UPDATE;
  task_id := 'export-attempt-' || p_id || '-' || p_lease_token;
  PERFORM 1 FROM public.data_export_object_cleanup_tasks t WHERE t.id = task_id AND t.archive_object_key = p_archive_key FOR UPDATE;
  IF NOT FOUND OR (lifecycle_state IS NOT NULL AND (lifecycle_state NOT IN ('active', 'pending_deletion') OR lifecycle_generation <> p_generation)) THEN RETURN false; END IF;
  UPDATE public.data_export_requests r SET status = 'ready', archive_object_key = p_archive_key, ready_at = now(), expires_at = now() + interval '24 hours', lease_token = null, lease_expires_at = null, updated_at = now() WHERE r.id = p_id AND r.status = 'building' AND r.lease_token = p_lease_token AND r.lease_expires_at > now() AND r.lifecycle_generation = p_generation;
  IF NOT FOUND THEN RETURN false; END IF;
  DELETE FROM public.data_export_object_cleanup_tasks WHERE id = task_id AND archive_object_key = p_archive_key;
  RETURN true;
END $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.dayli_export_fail(p_id text, p_lease_token text, p_category text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE subject text; task_id text;
BEGIN
  IF session_user <> 'lifecycle_worker' OR char_length(p_lease_token) < 16 OR p_category NOT IN ('size_limit', 'storage', 'source') THEN RAISE EXCEPTION 'export worker failure denied'; END IF;
  SELECT r.user_id INTO subject FROM public.data_export_requests r WHERE r.id = p_id FOR UPDATE; IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public."user" u WHERE u.id = subject FOR UPDATE; PERFORM 1 FROM public.account_lifecycles l WHERE l.user_id = subject FOR UPDATE;
  UPDATE public.data_export_requests r SET status = 'failed', snapshot_cutoff_at = null, failure_category = p_category, lease_token = null, lease_expires_at = null, updated_at = now() FROM public.account_lifecycles l WHERE r.id = p_id AND r.status = 'building' AND r.lease_token = p_lease_token AND r.lease_expires_at > now() AND l.user_id = r.user_id AND l.generation = r.lifecycle_generation AND l.state IN ('active', 'pending_deletion');
  IF FOUND THEN task_id := 'export-attempt-' || p_id || '-' || p_lease_token; UPDATE public.data_export_object_cleanup_tasks SET next_attempt_at = now(), updated_at = now() WHERE id = task_id AND status IN ('pending', 'failed'); END IF;
  RETURN FOUND;
END $$;--> statement-breakpoint

CREATE FUNCTION public.dayli_export_cleanup_claim(p_lease_token text, p_lease_seconds integer)
RETURNS TABLE(id text, archive_object_key text, lease_token text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF session_user <> 'lifecycle_worker' OR char_length(p_lease_token) < 16 OR p_lease_seconds NOT BETWEEN 30 AND 900 THEN RAISE EXCEPTION 'export cleanup claim denied'; END IF;
  RETURN QUERY WITH candidate AS (SELECT t.id FROM public.data_export_object_cleanup_tasks t WHERE t.status IN ('pending','failed') AND t.next_attempt_at <= now() AND NOT EXISTS (SELECT 1 FROM public.data_export_requests r WHERE t.id = 'export-attempt-' || r.id || '-' || r.lease_token AND r.status = 'building' AND r.lease_expires_at > now()) ORDER BY t.next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE public.data_export_object_cleanup_tasks t SET status='deleting', lease_token=p_lease_token, lease_expires_at=now()+make_interval(secs=>p_lease_seconds), next_attempt_at=null, failure_category=null, attempt_count=t.attempt_count+1, updated_at=now() FROM candidate WHERE t.id=candidate.id RETURNING t.id,t.archive_object_key,t.lease_token;
END $$;--> statement-breakpoint
CREATE FUNCTION public.dayli_export_cleanup_complete(p_id text, p_lease_token text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$ BEGIN IF session_user <> 'lifecycle_worker' OR char_length(p_lease_token) < 16 THEN RAISE EXCEPTION 'export cleanup completion denied'; END IF; DELETE FROM public.data_export_object_cleanup_tasks WHERE id=p_id AND status='deleting' AND lease_token=p_lease_token AND lease_expires_at > now(); RETURN FOUND; END $$;--> statement-breakpoint
CREATE FUNCTION public.dayli_export_cleanup_retry(p_id text, p_lease_token text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$ BEGIN IF session_user <> 'lifecycle_worker' OR char_length(p_lease_token) < 16 THEN RAISE EXCEPTION 'export cleanup retry denied'; END IF; UPDATE public.data_export_object_cleanup_tasks SET status='failed', lease_token=null, lease_expires_at=null, failure_category='storage', next_attempt_at=now()+interval '5 minutes', updated_at=now() WHERE id=p_id AND status='deleting' AND lease_token=p_lease_token AND lease_expires_at > now(); RETURN FOUND; END $$;--> statement-breakpoint

-- This is a selection cutoff, not an MVCC as-of snapshot. Each fixed query is
-- independently bounded, and no database transaction spans object-store I/O.
CREATE OR REPLACE FUNCTION public.dayli_export_source_page(p_id text, p_lease_token text, p_kind text, p_cursor text)
RETURNS TABLE(record jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE subject text; cutoff timestamptz;
BEGIN
  IF session_user <> 'lifecycle_worker' OR char_length(p_lease_token) < 16 OR p_kind NOT IN ('profile', 'journals', 'revisions', 'notes', 'messages') THEN RAISE EXCEPTION 'export source denied'; END IF;
  SELECT r.user_id, r.snapshot_cutoff_at INTO subject, cutoff FROM public.data_export_requests r LEFT JOIN public.account_lifecycles l ON l.user_id=r.user_id WHERE r.id=p_id AND r.status='building' AND r.lease_token=p_lease_token AND r.lease_expires_at>now() AND r.snapshot_cutoff_at IS NOT NULL AND (l.state IS NULL OR (l.state IN ('active','pending_deletion') AND l.generation=r.lifecycle_generation)); IF NOT FOUND THEN RETURN; END IF;
  IF p_kind='profile' THEN RETURN QUERY SELECT jsonb_build_object('type','account_profile','name',public.dayli_export_bounded_text(u.name),'username',public.dayli_export_bounded_text(u.username),'displayUsername',public.dayli_export_bounded_text(u.display_username),'bio',public.dayli_export_bounded_text(u.bio),'mbti',public.dayli_export_bounded_text(u.mbti),'whatIDo',public.dayli_export_bounded_text(u.what_i_do),'listeningTo',public.dayli_export_bounded_text(u.listening_to),'profileVisibility',u.profile_visibility,'email',public.dayli_export_bounded_text(u.email),'createdAt',u.created_at) FROM public."user" u WHERE u.id=subject;
  ELSIF p_kind='journals' THEN RETURN QUERY SELECT jsonb_build_object('type','journal','id',p.id,'localDate',p.local_date,'reflectiveAnswer',public.dayli_export_bounded_text(p.reflective_answer),'caption',public.dayli_export_bounded_text(p.caption),'rating',p.rating,'audience',p.audience,'acceptedAt',p.accepted_at,'releasedAt',p.released_at,'createdAt',p.created_at,'updatedAt',p.updated_at) FROM public.posts p WHERE p.author_id=subject AND p.id>p_cursor AND p.created_at<=cutoff ORDER BY p.id LIMIT 100;
  ELSIF p_kind='revisions' THEN RETURN QUERY SELECT jsonb_build_object('type','journal_revision','id',r.id,'postId',r.post_id,'revisionNumber',r.revision_number,'previousReflectiveAnswer',public.dayli_export_bounded_text(r.previous_reflective_answer),'previousCaption',public.dayli_export_bounded_text(r.previous_caption),'previousRating',r.previous_rating,'previousAudience',r.previous_audience,'previousPromptId',r.previous_prompt_id,'previousAttachmentRefs',(SELECT coalesce(jsonb_agg(jsonb_build_object('media_id',public.dayli_export_bounded_text(x.value->>'media_id'),'attachment_order',(x.value->>'attachment_order')::integer,'status',x.value->>'status')),'[]'::jsonb) FROM jsonb_array_elements(r.previous_attachment_refs) x),'createdAt',r.created_at) FROM public.post_revisions r JOIN public.posts p ON p.id=r.post_id WHERE p.author_id=subject AND r.id>p_cursor AND r.created_at<=cutoff AND jsonb_array_length(r.previous_attachment_refs)<=100 ORDER BY r.id LIMIT 100;
  ELSIF p_kind='notes' THEN RETURN QUERY SELECT jsonb_build_object('type','private_note','id',n.id,'postId',n.post_id,'note',public.dayli_export_bounded_text(n.note),'submittedAt',n.submitted_at,'availableOn',n.available_on) FROM public.tomorrow_notes n WHERE n.author_id=subject AND n.id>p_cursor AND n.submitted_at<=cutoff ORDER BY n.id LIMIT 100;
  ELSE RETURN QUERY SELECT jsonb_build_object('type','authored_message','id',m.id,'conversationId',m.conversation_id,'sequence',m.sequence,'clientMessageId',public.dayli_export_bounded_text(m.client_message_id),'body',public.dayli_export_bounded_text(m.body),'createdAt',m.created_at,'editedAt',m.edited_at,'unsentAt',m.unsent_at) FROM public.messages m JOIN public.messaging_participants mp ON mp.id=m.sender_participant_id WHERE mp.user_id=subject AND m.id>p_cursor AND m.created_at<=cutoff ORDER BY m.id LIMIT 100;
  END IF;
END $$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.dayli_export_bounded_text(text), public.dayli_export_reserve_object(text,text), public.dayli_export_publish(text,text,bigint,text,timestamptz), public.dayli_export_fail(text,text,text), public.dayli_export_cleanup_claim(text,integer), public.dayli_export_cleanup_complete(text,text), public.dayli_export_cleanup_retry(text,text) FROM PUBLIC, app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.dayli_export_reserve_object(text,text), public.dayli_export_publish(text,text,bigint,text,timestamptz), public.dayli_export_fail(text,text,text), public.dayli_export_cleanup_claim(text,integer), public.dayli_export_cleanup_complete(text,text), public.dayli_export_cleanup_retry(text,text) TO lifecycle_worker;