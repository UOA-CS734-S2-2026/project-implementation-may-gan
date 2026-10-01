-- The protected migrator applies this forward-only change atomically.
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint

-- A build pins its database cutoff at claim time. This prevents a worker-supplied
-- cutoff from changing the archive snapshot after a lease has been issued.
ALTER TABLE public.data_export_requests DROP CONSTRAINT IF EXISTS data_export_requests_state_check;--> statement-breakpoint
ALTER TABLE public.data_export_requests ADD CONSTRAINT data_export_requests_state_check CHECK (
  (status = 'ready' and snapshot_cutoff_at is not null and archive_object_key is not null and
    ready_at is not null and expires_at = ready_at + interval '24 hours' and
    archive_cleanup_task_id is null and failure_category is null and lease_token is null and lease_expires_at is null) or
  (status = 'requested' and snapshot_cutoff_at is null and archive_object_key is null and
    ready_at is null and expires_at is null and archive_cleanup_task_id is null and failure_category is null and lease_token is null and lease_expires_at is null) or
  (status = 'building' and snapshot_cutoff_at is not null and archive_object_key is null and
    ready_at is null and expires_at is null and archive_cleanup_task_id is null and failure_category is null and lease_token is not null and lease_expires_at is not null) or
  (status = 'failed' and snapshot_cutoff_at is null and archive_object_key is null and
    ready_at is null and expires_at is null and archive_cleanup_task_id is null and failure_category is not null and lease_token is null and lease_expires_at is null) or
  (status = 'cancelled' and snapshot_cutoff_at is null and archive_object_key is null and
    ready_at is null and expires_at is null and archive_cleanup_task_id is null and failure_category is null and lease_token is null and lease_expires_at is null) or
  (status = 'expired' and snapshot_cutoff_at is null and archive_object_key is null and
    ready_at is null and expires_at is null and archive_cleanup_task_id is not null and failure_category is null and lease_token is null and lease_expires_at is null)
) NOT VALID;--> statement-breakpoint
ALTER TABLE public.data_export_requests VALIDATE CONSTRAINT data_export_requests_state_check;--> statement-breakpoint

-- Reclaiming a dead worker first terminalizes its old fence. A future request is
-- no longer blocked by a stale partial unique-index entry. Existing releases did
-- not record an object before creation, so old leases cannot name a safe cleanup key.
DROP FUNCTION public.dayli_export_claim(text, integer);--> statement-breakpoint
CREATE FUNCTION public.dayli_export_claim(p_lease_token text, p_lease_seconds integer)
RETURNS TABLE(id text, user_id text, lifecycle_generation bigint, lease_token text, snapshot_cutoff_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE claimed_id text;
BEGIN
  IF session_user <> 'lifecycle_worker' OR char_length(p_lease_token) < 16 OR p_lease_seconds NOT BETWEEN 30 AND 900 THEN RAISE EXCEPTION 'export worker claim denied'; END IF;
  UPDATE public.data_export_requests r SET status = 'failed', snapshot_cutoff_at = null, lease_token = null, lease_expires_at = null, failure_category = 'storage', updated_at = now()
  FROM public.account_lifecycles l
  WHERE r.user_id = l.user_id AND r.status IN ('requested', 'building')
    AND (r.lifecycle_generation <> l.generation OR l.state NOT IN ('active', 'pending_deletion') OR (r.status = 'building' AND r.lease_expires_at <= now()));
  SELECT r.id INTO claimed_id FROM public.data_export_requests r
  LEFT JOIN public.account_lifecycles l ON l.user_id = r.user_id
  WHERE r.status = 'requested' AND (l.state IS NULL OR l.state IN ('active', 'pending_deletion'))
  ORDER BY r.requested_at FOR UPDATE OF r SKIP LOCKED LIMIT 1;
  IF claimed_id IS NULL THEN RETURN; END IF;
  UPDATE public.data_export_requests
  SET status = 'building', snapshot_cutoff_at = now(), lease_token = p_lease_token,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds), updated_at = now()
  WHERE data_export_requests.id = claimed_id
  RETURNING data_export_requests.id, data_export_requests.user_id, data_export_requests.lifecycle_generation,
    data_export_requests.lease_token, data_export_requests.snapshot_cutoff_at
  INTO id, user_id, lifecycle_generation, lease_token, snapshot_cutoff_at;
  RETURN NEXT;
END $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.dayli_export_reserve_object(p_id text, p_lease_token text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE object_key text; task_id text;
BEGIN
  IF session_user <> 'lifecycle_worker' OR char_length(p_lease_token) < 16 THEN RAISE EXCEPTION 'export object reservation denied'; END IF;
  object_key := 'private/data-exports/' || p_id || '/' || p_lease_token || '.zip';
  task_id := 'export-attempt-' || p_id || '-' || p_lease_token;
  PERFORM 1 FROM public.data_export_requests r LEFT JOIN public.account_lifecycles l ON l.user_id = r.user_id
    WHERE r.id = p_id AND r.status = 'building' AND r.lease_token = p_lease_token AND r.lease_expires_at > now()
      AND (l.state IS NULL OR (l.state IN ('active', 'pending_deletion') AND l.generation = r.lifecycle_generation)) FOR UPDATE OF r;
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO public.data_export_object_cleanup_tasks (id, archive_object_key, status, next_attempt_at)
    VALUES (task_id, object_key, 'pending', now()) ON CONFLICT (id) DO NOTHING;
  RETURN object_key;
END $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.dayli_export_publish(p_id text, p_lease_token text, p_generation bigint, p_archive_key text, p_cutoff timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE state public.account_lifecycle_state; generation bigint; task_id text;
BEGIN
  IF session_user <> 'lifecycle_worker' OR char_length(p_lease_token) < 16 THEN RAISE EXCEPTION 'export worker publication denied'; END IF;
  IF p_archive_key <> 'private/data-exports/' || p_id || '/' || p_lease_token || '.zip' THEN RETURN false; END IF;
  task_id := 'export-attempt-' || p_id || '-' || p_lease_token;
  SELECT l.state, l.generation INTO state, generation FROM public.data_export_requests r LEFT JOIN public.account_lifecycles l ON l.user_id = r.user_id WHERE r.id = p_id FOR UPDATE OF r;
  IF NOT FOUND OR (state IS NOT NULL AND (state NOT IN ('active', 'pending_deletion') OR generation <> p_generation)) THEN RETURN false; END IF;
  UPDATE public.data_export_requests SET status = 'ready', snapshot_cutoff_at = snapshot_cutoff_at, archive_object_key = p_archive_key,
    ready_at = now(), expires_at = now() + interval '24 hours', lease_token = null, lease_expires_at = null, updated_at = now()
  WHERE id = p_id AND status = 'building' AND lease_token = p_lease_token AND lease_expires_at > now()
    AND lifecycle_generation = p_generation;
  IF NOT FOUND THEN RETURN false; END IF;
  DELETE FROM public.data_export_object_cleanup_tasks WHERE id = task_id AND archive_object_key = p_archive_key;
  RETURN true;
END $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.dayli_export_fail(p_id text, p_lease_token text, p_category text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF session_user <> 'lifecycle_worker' OR char_length(p_lease_token) < 16 OR p_category NOT IN ('size_limit', 'storage', 'source') THEN RAISE EXCEPTION 'export worker failure denied'; END IF;
  UPDATE public.data_export_requests r SET status = 'failed', snapshot_cutoff_at = null, failure_category = p_category,
    lease_token = null, lease_expires_at = null, updated_at = now()
  FROM public.account_lifecycles l
  WHERE r.id = p_id AND r.status = 'building' AND r.lease_token = p_lease_token AND r.lease_expires_at > now()
    AND l.user_id = r.user_id AND l.generation = r.lifecycle_generation AND l.state IN ('active', 'pending_deletion');
  RETURN FOUND;
END $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.dayli_export_cancel_for_purge(p_user_id text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE cleanup_id text; archive_key text; request_id text; total integer := 0;
BEGIN
  IF session_user <> 'lifecycle_worker' THEN RAISE EXCEPTION 'export purge cancellation denied'; END IF;
  FOR request_id, archive_key IN SELECT id, archive_object_key FROM public.data_export_requests WHERE user_id = p_user_id AND status = 'ready' FOR UPDATE LOOP
    cleanup_id := 'export-cleanup-' || request_id;
    INSERT INTO public.data_export_object_cleanup_tasks (id, archive_object_key, status, next_attempt_at) VALUES (cleanup_id, archive_key, 'pending', now()) ON CONFLICT (id) DO NOTHING;
    UPDATE public.data_export_requests SET status = 'expired', archive_object_key = null, snapshot_cutoff_at = null, ready_at = null, expires_at = null, archive_cleanup_task_id = cleanup_id, updated_at = now() WHERE id = request_id;
    total := total + 1;
  END LOOP;
  UPDATE public.data_export_requests SET status = 'cancelled', snapshot_cutoff_at = null, lease_token = null, lease_expires_at = null, updated_at = now() WHERE user_id = p_user_id AND status IN ('requested', 'building');
  RETURN total;
END $$;--> statement-breakpoint

-- Each query has a fixed projection and derives the subject, cutoff, lifecycle
-- generation, and valid lease from the claimed request. The worker has no table
-- SELECT privilege and cannot substitute a different subject or cutoff.
CREATE FUNCTION public.dayli_export_source_page(p_id text, p_lease_token text, p_kind text, p_cursor text)
RETURNS TABLE(record jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE subject text; cutoff timestamptz;
BEGIN
  IF session_user <> 'lifecycle_worker' OR char_length(p_lease_token) < 16 OR p_kind NOT IN ('profile', 'journals', 'revisions', 'notes', 'messages') THEN RAISE EXCEPTION 'export source denied'; END IF;
  SELECT r.user_id, r.snapshot_cutoff_at INTO subject, cutoff FROM public.data_export_requests r
  LEFT JOIN public.account_lifecycles l ON l.user_id = r.user_id
  WHERE r.id = p_id AND r.status = 'building' AND r.lease_token = p_lease_token AND r.lease_expires_at > now()
    AND r.snapshot_cutoff_at IS NOT NULL AND (l.state IS NULL OR (l.state IN ('active', 'pending_deletion') AND l.generation = r.lifecycle_generation));
  IF NOT FOUND THEN RETURN; END IF;
  IF p_kind = 'profile' THEN
    RETURN QUERY SELECT jsonb_build_object('type','account_profile','name',u.name,'username',u.username,'displayUsername',u.display_username,'bio',u.bio,'mbti',u.mbti,'whatIDo',u.what_i_do,'listeningTo',u.listening_to,'profileVisibility',u.profile_visibility,'email',u.email,'createdAt',u.created_at) FROM public."user" u WHERE u.id = subject;
  ELSIF p_kind = 'journals' THEN
    RETURN QUERY SELECT jsonb_build_object('type','journal','id',p.id,'localDate',p.local_date,'reflectiveAnswer',p.reflective_answer,'caption',p.caption,'rating',p.rating,'audience',p.audience,'acceptedAt',p.accepted_at,'releasedAt',p.released_at,'createdAt',p.created_at,'updatedAt',p.updated_at) FROM public.posts p WHERE p.author_id = subject AND p.id > p_cursor AND p.created_at <= cutoff ORDER BY p.id LIMIT 100;
  ELSIF p_kind = 'revisions' THEN
    RETURN QUERY SELECT jsonb_build_object('type','journal_revision','id',r.id,'postId',r.post_id,'revisionNumber',r.revision_number,'previousReflectiveAnswer',r.previous_reflective_answer,'previousCaption',r.previous_caption,'previousRating',r.previous_rating,'previousAudience',r.previous_audience,'previousPromptId',r.previous_prompt_id,'previousAttachmentRefs',(SELECT coalesce(jsonb_agg(jsonb_build_object('media_id',x.value->>'media_id','attachment_order',(x.value->>'attachment_order')::integer,'status',x.value->>'status')),'[]'::jsonb) FROM jsonb_array_elements(r.previous_attachment_refs) x),'createdAt',r.created_at) FROM public.post_revisions r JOIN public.posts p ON p.id = r.post_id WHERE p.author_id = subject AND r.id > p_cursor AND r.created_at <= cutoff ORDER BY r.id LIMIT 100;
  ELSIF p_kind = 'notes' THEN
    RETURN QUERY SELECT jsonb_build_object('type','private_note','id',n.id,'postId',n.post_id,'note',n.note,'submittedAt',n.submitted_at,'availableOn',n.available_on) FROM public.tomorrow_notes n WHERE n.author_id = subject AND n.id > p_cursor AND n.submitted_at <= cutoff ORDER BY n.id LIMIT 100;
  ELSE
    RETURN QUERY SELECT jsonb_build_object('type','authored_message','id',m.id,'conversationId',m.conversation_id,'sequence',m.sequence,'clientMessageId',m.client_message_id,'body',m.body,'createdAt',m.created_at,'editedAt',m.edited_at,'unsentAt',m.unsent_at) FROM public.messages m JOIN public.messaging_participants mp ON mp.id = m.sender_participant_id WHERE mp.user_id = subject AND m.id > p_cursor AND m.created_at <= cutoff ORDER BY m.id LIMIT 100;
  END IF;
END $$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.dayli_export_claim(text, integer), public.dayli_export_publish(text, text, bigint, text, timestamptz), public.dayli_export_fail(text, text, text), public.dayli_export_reserve_object(text, text), public.dayli_export_source_page(text, text, text, text) FROM PUBLIC, app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.dayli_export_claim(text, integer), public.dayli_export_publish(text, text, bigint, text, timestamptz), public.dayli_export_fail(text, text, text), public.dayli_export_reserve_object(text, text), public.dayli_export_source_page(text, text, text, text) TO lifecycle_worker;