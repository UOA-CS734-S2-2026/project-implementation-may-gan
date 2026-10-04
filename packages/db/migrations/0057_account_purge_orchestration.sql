-- squawk-ignore-file prefer-robust-stmts
-- squawk-ignore-file constraint-missing-not-valid
-- squawk-ignore-file adding-foreign-key-constraint
-- squawk-ignore-file require-concurrent-index-creation
-- Account purge is staged behind leased SECURITY DEFINER procedures. It is not
-- scheduled or activated by this migration. A worker receives one opaque R2
-- key at a time, and physical deletion is impossible until every owned key has
-- a fenced successful completion.
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
CREATE TYPE public.account_purge_object_cleanup_status AS ENUM ('pending', 'deleting', 'failed', 'completed');--> statement-breakpoint
CREATE TABLE public.account_purge_object_cleanup_tasks (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL,
  object_key text NOT NULL,
  export_cleanup_task_id text,
  status public.account_purge_object_cleanup_status NOT NULL DEFAULT 'pending',
  attempt_count bigint NOT NULL DEFAULT 0,
  next_attempt_at timestamptz DEFAULT clock_timestamp(),
  lease_token text,
  lease_expires_at timestamptz,
  failure_category text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  CONSTRAINT account_purge_object_cleanup_tasks_user_key_unique UNIQUE (user_id, object_key),
  CONSTRAINT account_purge_object_cleanup_tasks_id_check CHECK (char_length(id) between 1 and 200),
  CONSTRAINT account_purge_object_cleanup_tasks_key_check CHECK (char_length(object_key) between 1 and 1024),
  CONSTRAINT account_purge_object_cleanup_tasks_attempt_check CHECK (attempt_count >= 0),
  CONSTRAINT account_purge_object_cleanup_tasks_failure_check CHECK (failure_category IS NULL OR char_length(failure_category) between 1 and 100),
  CONSTRAINT account_purge_object_cleanup_tasks_lease_pair_check CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL)),
  CONSTRAINT account_purge_object_cleanup_tasks_state_check CHECK (
    (status = 'pending' AND lease_token IS NULL AND failure_category IS NULL) OR
    (status = 'deleting' AND lease_token IS NOT NULL AND next_attempt_at IS NULL AND failure_category IS NULL) OR
    (status = 'failed' AND lease_token IS NULL AND failure_category IS NOT NULL) OR
    (status = 'completed' AND lease_token IS NULL AND failure_category IS NULL AND completed_at IS NOT NULL)
  )
);--> statement-breakpoint
ALTER TABLE public.account_purge_object_cleanup_tasks ADD CONSTRAINT account_purge_object_cleanup_tasks_user_fk
  FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE public.account_purge_object_cleanup_tasks ADD CONSTRAINT account_purge_object_cleanup_tasks_export_fk
  FOREIGN KEY (export_cleanup_task_id) REFERENCES public.data_export_object_cleanup_tasks(id) ON DELETE NO ACTION;--> statement-breakpoint
CREATE INDEX account_purge_object_cleanup_tasks_due_idx ON public.account_purge_object_cleanup_tasks (status, next_attempt_at);--> statement-breakpoint
CREATE INDEX account_purge_object_cleanup_tasks_lease_idx ON public.account_purge_object_cleanup_tasks (status, lease_expires_at);--> statement-breakpoint

-- Physical deletion only runs after the R2 task set is empty under the account
-- lifecycle lease. It retains a content-free receipt, detaches durable message
-- identities, and removes a conversation only when every participant is gone.
CREATE FUNCTION public.finish_account_purge(p_user_id text, p_generation bigint, p_lease_token text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_lifecycle public.account_lifecycles%ROWTYPE;
  v_now timestamptz;
  v_export_task_ids text[];
BEGIN
  SELECT lifecycle.* INTO v_lifecycle FROM public.account_lifecycles lifecycle
    WHERE lifecycle.user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_lifecycle.state <> 'purging' OR v_lifecycle.generation <> p_generation
    OR v_lifecycle.lease_token IS DISTINCT FROM p_lease_token
    OR v_lifecycle.lease_expires_at <= clock_timestamp()
    OR EXISTS (SELECT 1 FROM public.account_purge_object_cleanup_tasks task
      WHERE task.user_id = p_user_id AND task.status <> 'completed') THEN
    RETURN false;
  END IF;
  v_now := clock_timestamp();
  SELECT coalesce(array_agg(DISTINCT task.export_cleanup_task_id), ARRAY[]::text[])
    INTO v_export_task_ids FROM public.account_purge_object_cleanup_tasks task
    WHERE task.user_id = p_user_id AND task.export_cleanup_task_id IS NOT NULL;

  -- Lock shared conversations, then every durable participant in those
  -- conversations, in deterministic order before observing membership state.
  -- Concurrent deletion of both direct-message owners then serializes, so the
  -- second finalizer sees both deleted participants and removes the history.
  PERFORM 1 FROM public.conversations conversation
    WHERE EXISTS (SELECT 1 FROM public.conversation_members member
      JOIN public.messaging_participants participant ON participant.id = member.participant_id
      WHERE member.conversation_id = conversation.id AND participant.user_id = p_user_id)
    ORDER BY conversation.id FOR UPDATE;
  PERFORM 1 FROM public.messaging_participants participant
    WHERE participant.id IN (SELECT member.participant_id FROM public.conversation_members member
      WHERE member.conversation_id IN (SELECT linked.conversation_id FROM public.conversation_members linked
        JOIN public.messaging_participants owner ON owner.id = linked.participant_id
        WHERE owner.user_id = p_user_id))
    ORDER BY participant.id FOR UPDATE;
  -- Mark the durable participant before FK SET NULL actions fire on user delete.
  UPDATE public.messaging_participants participant SET state = 'deleted', user_id = NULL
    WHERE participant.user_id = p_user_id;
  DELETE FROM public.friend_requests WHERE sender_id = p_user_id OR recipient_id = p_user_id;
  DELETE FROM public.friendships WHERE user_id = p_user_id OR friend_id = p_user_id;
  DELETE FROM public.relationship_blocks WHERE blocker_id = p_user_id OR blocked_id = p_user_id;
  DELETE FROM public.post_comments WHERE author_id = p_user_id OR deleted_by = p_user_id;
  DELETE FROM public.post_likes WHERE user_id = p_user_id;
  DELETE FROM public.future_self_notes WHERE owner_id = p_user_id;
  DELETE FROM public.profile_avatars WHERE user_id = p_user_id;
  -- These historical rows deliberately have restrictive FKs and immutable-row
  -- guards. This SECURITY DEFINER cleanup owns their only physical purge path.
  DELETE FROM public.legacy_cloudinary_media WHERE media_id IN (
    SELECT media.id FROM public.post_media media JOIN public.posts post ON post.id = media.post_id
    WHERE post.author_id = p_user_id);
  DELETE FROM public.tomorrow_notes WHERE author_id = p_user_id OR post_id IN (
    SELECT post.id FROM public.posts post WHERE post.author_id = p_user_id);
  DELETE FROM public.post_revisions WHERE post_id IN (
    SELECT post.id FROM public.posts post WHERE post.author_id = p_user_id);
  DELETE FROM public.post_media WHERE post_id IN (
    SELECT post.id FROM public.posts post WHERE post.author_id = p_user_id);
  DELETE FROM public.posts WHERE author_id = p_user_id;
  DELETE FROM public.media_reservation WHERE owner_id = p_user_id;
  -- Requests reference their cleanup task, so remove request references first.
  DELETE FROM public.data_export_requests WHERE user_id = p_user_id;
  UPDATE public.account_purge_object_cleanup_tasks SET export_cleanup_task_id = NULL
    WHERE user_id = p_user_id;
  IF cardinality(v_export_task_ids) > 0 THEN
    -- An S3 multipart completion can win after any finite absence check. Keep
    -- the provider-owned cleanup metadata after account finalization so the
    -- established export reconciler performs its later 24-hour absence pass.
    UPDATE public.data_export_object_cleanup_tasks task SET status = 'pending', lease_token = NULL,
      lease_expires_at = NULL, next_attempt_at = v_now, failure_category = NULL,
      verified_absent_at = NULL, updated_at = v_now WHERE task.id = ANY(v_export_task_ids);
  END IF;
  DELETE FROM public.account_purge_object_cleanup_tasks WHERE user_id = p_user_id;

  -- The first deletion leaves the other participant's retained history intact.
  -- The second deletion removes the now participant-empty conversation and its history.
  DELETE FROM public.conversations conversation
    WHERE EXISTS (SELECT 1 FROM public.conversation_members member
      WHERE member.conversation_id = conversation.id AND member.user_id IS NULL)
      AND NOT EXISTS (SELECT 1 FROM public.conversation_members member
        JOIN public.messaging_participants participant ON participant.id = member.participant_id
        WHERE member.conversation_id = conversation.id AND participant.state <> 'deleted');

  INSERT INTO public.account_purge_receipts
    (request_id, subject_digest, requested_at, completed_at, expires_at, completed_stage_count)
    VALUES (v_lifecycle.request_id, encode(sha256(convert_to(p_user_id, 'UTF8')), 'hex'),
      v_lifecycle.requested_at, v_now, v_now + interval '720 hours', 7);
  DELETE FROM public."user" WHERE id = p_user_id;
  RETURN FOUND;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.finish_account_purge(text, bigint, text) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint

-- Receipts retain no account content, but their retention deadline is enforced
-- by an executable, bounded worker procedure rather than an aspirational index.
CREATE FUNCTION public.delete_expired_account_purge_receipts(p_limit integer)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_deleted integer;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RETURN 0; END IF;
  DELETE FROM public.account_purge_receipts receipt WHERE receipt.request_id IN (
    SELECT due.request_id FROM public.account_purge_receipts due
      WHERE due.expires_at <= clock_timestamp() ORDER BY due.expires_at, due.request_id
      LIMIT p_limit FOR UPDATE SKIP LOCKED);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.delete_expired_account_purge_receipts(integer) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.delete_expired_account_purge_receipts(integer) TO lifecycle_worker;--> statement-breakpoint

CREATE FUNCTION public.claim_account_purge_cleanup(p_limit integer, p_lease_token text, p_lease_seconds integer)
RETURNS TABLE(task_id text, owner_id text, lifecycle_generation bigint, object_key text, export_cleanup_task_id text, export_upload_id text, lease_token text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  candidate record;
  v_lifecycle public.account_lifecycles%ROWTYPE;
  v_task public.account_purge_object_cleanup_tasks%ROWTYPE;
  v_export_upload_id text;
  v_now timestamptz;
  claimed integer := 0;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 10 OR p_lease_token IS NULL
    OR char_length(p_lease_token) NOT BETWEEN 1 AND 200 OR p_lease_seconds IS NULL
    OR p_lease_seconds NOT BETWEEN 30 AND 300 THEN RETURN; END IF;

  FOR candidate IN SELECT lifecycle.user_id FROM public.account_lifecycles lifecycle
    WHERE (lifecycle.state = 'pending_deletion' AND lifecycle.purge_due_at <= clock_timestamp())
      OR (lifecycle.state = 'purge_failed' AND lifecycle.next_attempt_at <= clock_timestamp())
      OR (lifecycle.state = 'purging' AND (lifecycle.lease_expires_at IS NULL OR lifecycle.lease_expires_at <= clock_timestamp()))
    ORDER BY lifecycle.purge_due_at, lifecycle.user_id LIMIT p_limit * 4
  LOOP
    PERFORM 1 FROM public."user" person WHERE person.id = candidate.user_id FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN CONTINUE; END IF;
    SELECT lifecycle.* INTO v_lifecycle FROM public.account_lifecycles lifecycle
      WHERE lifecycle.user_id = candidate.user_id
        AND ((lifecycle.state = 'pending_deletion' AND lifecycle.purge_due_at <= clock_timestamp())
          OR (lifecycle.state = 'purge_failed' AND lifecycle.next_attempt_at <= clock_timestamp())
          OR (lifecycle.state = 'purging' AND (lifecycle.lease_expires_at IS NULL OR lifecycle.lease_expires_at <= clock_timestamp())))
      FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN CONTINUE; END IF;
    v_now := clock_timestamp();
    UPDATE public.account_lifecycles lifecycle SET state = 'purging', purge_started_at = coalesce(lifecycle.purge_started_at, v_now),
      last_error_category = NULL, next_attempt_at = NULL, lease_token = p_lease_token,
      lease_expires_at = v_now + make_interval(secs => p_lease_seconds), updated_at = v_now
      WHERE lifecycle.user_id = candidate.user_id;

    -- Never guess a legacy key or delete a reservation referenced by anyone else.
    IF EXISTS (SELECT 1 FROM public.post_media media JOIN public.posts post ON post.id = media.post_id
        LEFT JOIN public.media_reservation reservation ON reservation.id = media.reservation_id
        LEFT JOIN public.legacy_cloudinary_media legacy ON legacy.media_id = media.id
        WHERE post.author_id = candidate.user_id
          AND (media.reservation_id IS NULL OR reservation.owner_id IS DISTINCT FROM candidate.user_id OR legacy.media_id IS NOT NULL))
      OR EXISTS (SELECT 1 FROM public.media_reservation reservation
        WHERE reservation.owner_id = candidate.user_id AND (
          EXISTS (SELECT 1 FROM public.post_media media JOIN public.posts post ON post.id = media.post_id
            WHERE media.reservation_id = reservation.id AND post.author_id <> candidate.user_id)
          OR EXISTS (SELECT 1 FROM public.profile_avatars avatar
            WHERE avatar.reservation_id = reservation.id AND avatar.user_id <> candidate.user_id))) THEN
      -- Legacy or shared ownership has no safe object provenance. It is a
      -- terminal, operator-visible failure, never an automatic destructive retry.
      UPDATE public.account_lifecycles lifecycle SET state = 'purge_failed', last_error_category = 'unsupported_media',
        next_attempt_at = 'infinity'::timestamptz, lease_token = NULL, lease_expires_at = NULL, updated_at = v_now
        WHERE lifecycle.user_id = candidate.user_id AND lifecycle.lease_token = p_lease_token;
      CONTINUE;
    END IF;

    INSERT INTO public.account_purge_object_cleanup_tasks (id, user_id, object_key, next_attempt_at)
      SELECT 'purge_media_' || encode(sha256(convert_to(candidate.user_id || ':' || reservation.id, 'UTF8')), 'hex'),
        candidate.user_id, reservation.object_key, v_now
      FROM public.media_reservation reservation WHERE reservation.owner_id = candidate.user_id
      ON CONFLICT ON CONSTRAINT account_purge_object_cleanup_tasks_user_key_unique DO NOTHING;
    INSERT INTO public.account_purge_object_cleanup_tasks (id, user_id, object_key, export_cleanup_task_id, next_attempt_at)
      SELECT 'purge_export_' || encode(sha256(convert_to(candidate.user_id || ':' || task.id, 'UTF8')), 'hex'),
        candidate.user_id, task.archive_object_key, task.id, v_now
      FROM public.data_export_object_cleanup_tasks task
      WHERE EXISTS (SELECT 1 FROM public.data_export_requests request
        WHERE request.user_id = candidate.user_id
          AND task.archive_object_key LIKE 'private/data-exports/v2/' || encode(sha256(convert_to(request.id, 'UTF8')), 'hex') || '/%')
      ON CONFLICT ON CONSTRAINT account_purge_object_cleanup_tasks_user_key_unique DO UPDATE
        SET export_cleanup_task_id = excluded.export_cleanup_task_id;

    SELECT task.* INTO v_task FROM public.account_purge_object_cleanup_tasks task
      WHERE task.user_id = candidate.user_id
        AND ((task.status IN ('pending', 'failed') AND task.next_attempt_at <= v_now)
          OR (task.status = 'deleting' AND task.lease_expires_at <= v_now))
      ORDER BY task.created_at, task.id FOR UPDATE SKIP LOCKED LIMIT 1;
    IF NOT FOUND THEN
      PERFORM public.finish_account_purge(candidate.user_id, v_lifecycle.generation, p_lease_token);
      CONTINUE;
    END IF;
    UPDATE public.account_purge_object_cleanup_tasks task SET status = 'deleting', attempt_count = task.attempt_count + 1,
      next_attempt_at = NULL, lease_token = p_lease_token,
      lease_expires_at = v_now + make_interval(secs => p_lease_seconds), failure_category = NULL, updated_at = v_now
      WHERE task.id = v_task.id;
    SELECT cleanup.upload_id INTO v_export_upload_id
      FROM public.data_export_object_cleanup_tasks cleanup WHERE cleanup.id = v_task.export_cleanup_task_id;
    task_id := v_task.id; owner_id := candidate.user_id; lifecycle_generation := v_lifecycle.generation;
    object_key := v_task.object_key; export_cleanup_task_id := v_task.export_cleanup_task_id;
    export_upload_id := v_export_upload_id; lease_token := p_lease_token;
    RETURN NEXT; claimed := claimed + 1;
    IF claimed >= p_limit THEN RETURN; END IF;
  END LOOP;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.claim_account_purge_cleanup(integer, text, integer) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.claim_account_purge_cleanup(integer, text, integer) TO lifecycle_worker;--> statement-breakpoint

CREATE FUNCTION public.complete_account_purge_cleanup(p_task_id text, p_generation bigint, p_lease_token text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_task public.account_purge_object_cleanup_tasks%ROWTYPE;
  v_lifecycle public.account_lifecycles%ROWTYPE;
  v_user_id text;
BEGIN
  SELECT task.user_id INTO v_user_id FROM public.account_purge_object_cleanup_tasks task WHERE task.id = p_task_id;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public."user" person WHERE person.id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT lifecycle.* INTO v_lifecycle FROM public.account_lifecycles lifecycle WHERE lifecycle.user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT task.* INTO v_task FROM public.account_purge_object_cleanup_tasks task WHERE task.id = p_task_id FOR UPDATE;
  IF NOT FOUND OR v_lifecycle.state <> 'purging' OR v_lifecycle.generation <> p_generation
    OR v_lifecycle.lease_token IS DISTINCT FROM p_lease_token OR v_lifecycle.lease_expires_at <= clock_timestamp()
    OR v_task.status <> 'deleting' OR v_task.lease_token IS DISTINCT FROM p_lease_token
    OR v_task.lease_expires_at <= clock_timestamp() THEN RETURN false; END IF;
  UPDATE public.account_purge_object_cleanup_tasks task SET status = 'completed', lease_token = NULL,
    lease_expires_at = NULL, next_attempt_at = clock_timestamp(), failure_category = NULL,
    completed_at = clock_timestamp(), updated_at = clock_timestamp() WHERE task.id = p_task_id;
  IF EXISTS (SELECT 1 FROM public.account_purge_object_cleanup_tasks task
    WHERE task.user_id = v_task.user_id AND task.status <> 'completed') THEN
    -- A completed non-final object releases only the lifecycle lease. A later
    -- worker receives a new fence to process the next opaque object key.
    UPDATE public.account_lifecycles lifecycle SET lease_token = NULL, lease_expires_at = NULL,
      updated_at = clock_timestamp() WHERE lifecycle.user_id = v_task.user_id
        AND lifecycle.generation = p_generation AND lifecycle.lease_token = p_lease_token;
    RETURN true;
  END IF;
  PERFORM public.finish_account_purge(v_task.user_id, p_generation, p_lease_token);
  RETURN true;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.complete_account_purge_cleanup(text, bigint, text) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.complete_account_purge_cleanup(text, bigint, text) TO lifecycle_worker;--> statement-breakpoint

CREATE FUNCTION public.retry_account_purge_cleanup(p_task_id text, p_generation bigint, p_lease_token text, p_delay_seconds integer)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_user_id text; v_now timestamptz;
BEGIN
  IF p_delay_seconds IS NULL OR p_delay_seconds NOT BETWEEN 30 AND 604800 THEN RETURN false; END IF;
  SELECT task.user_id INTO v_user_id FROM public.account_purge_object_cleanup_tasks task WHERE task.id = p_task_id;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public."user" person WHERE person.id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public.account_lifecycles lifecycle WHERE lifecycle.user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public.account_purge_object_cleanup_tasks task WHERE task.id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  v_now := clock_timestamp();
  UPDATE public.account_purge_object_cleanup_tasks task SET status = 'failed', lease_token = NULL, lease_expires_at = NULL,
    next_attempt_at = v_now + make_interval(secs => p_delay_seconds), failure_category = 'storage', updated_at = v_now
    WHERE task.id = p_task_id AND task.status = 'deleting' AND task.lease_token = p_lease_token AND task.lease_expires_at > v_now;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.account_lifecycles lifecycle SET state = 'purge_failed', last_error_category = 'storage',
    next_attempt_at = v_now + make_interval(secs => p_delay_seconds), lease_token = NULL, lease_expires_at = NULL, updated_at = v_now
    WHERE lifecycle.user_id = v_user_id AND lifecycle.generation = p_generation AND lifecycle.state = 'purging'
      AND lifecycle.lease_token = p_lease_token AND lifecycle.lease_expires_at > v_now;
  RETURN FOUND;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.retry_account_purge_cleanup(text, bigint, text, integer) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.retry_account_purge_cleanup(text, bigint, text, integer) TO lifecycle_worker;--> statement-breakpoint

CREATE FUNCTION public.report_account_purge_cleanup()
RETURNS TABLE(due_count bigint, failed_count bigint, terminal_failed_count bigint, leased_count bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT count(*) FILTER (WHERE (lifecycle.state = 'pending_deletion' AND lifecycle.purge_due_at <= clock_timestamp())
      OR (lifecycle.state = 'purge_failed' AND lifecycle.next_attempt_at <= clock_timestamp())
      OR (lifecycle.state = 'purging' AND (lifecycle.lease_expires_at IS NULL OR lifecycle.lease_expires_at <= clock_timestamp()))) AS due_count,
    count(*) FILTER (WHERE lifecycle.state = 'purge_failed') AS failed_count,
    count(*) FILTER (WHERE lifecycle.state = 'purge_failed' AND lifecycle.next_attempt_at = 'infinity'::timestamptz) AS terminal_failed_count,
    count(*) FILTER (WHERE lifecycle.state = 'purging' AND lifecycle.lease_expires_at > clock_timestamp()) AS leased_count
  FROM public.account_lifecycles lifecycle;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.report_account_purge_cleanup() FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.report_account_purge_cleanup() TO lifecycle_worker;--> statement-breakpoint
REVOKE ALL ON TABLE public.account_purge_object_cleanup_tasks FROM app, lifecycle_worker;
REVOKE ALL ON TABLE public.account_purge_receipts FROM app, lifecycle_worker;