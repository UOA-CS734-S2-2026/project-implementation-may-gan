-- squawk-ignore-file prefer-robust-stmts
-- Trash execution is deliberately limited to SECURITY DEFINER procedures. The
-- application role can move or restore only its own session-owned post. The
-- worker gets opaque, leased object keys and cannot issue broad table deletes.
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
-- 0030's unqualified trashed_at in this procedure collides with the OUT
-- parameter name under PostgreSQL's default plpgsql variable policy. Replace
-- it in a forward migration, leaving applied migration bytes untouched.
CREATE OR REPLACE FUNCTION public.restore_trashed_post(p_user_id text, p_session_id text, p_post_id text)
RETURNS TABLE(outcome text, trashed_at timestamptz, restore_until timestamptz, purge_due_at timestamptz, generation bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  target_post public.posts%ROWTYPE;
  lifecycle_state public.account_lifecycle_state;
BEGIN
  IF p_user_id IS NULL OR p_session_id IS NULL OR p_post_id IS NULL THEN
    RETURN QUERY SELECT 'not_found'::text, null::timestamptz, null::timestamptz, null::timestamptz, null::bigint;
    RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('posts:author:' || p_user_id, 734));
  PERFORM 1 FROM public."user" AS owner WHERE owner.id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, null::timestamptz, null::timestamptz, null::timestamptz, null::bigint;
    RETURN;
  END IF;
  PERFORM 1 FROM public.session AS active_session
  WHERE active_session.id = p_session_id AND active_session.user_id = p_user_id AND active_session.expires_at > clock_timestamp() FOR SHARE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid_session'::text, null::timestamptz, null::timestamptz, null::timestamptz, null::bigint;
    RETURN;
  END IF;
  SELECT lifecycle.state INTO lifecycle_state FROM public.account_lifecycles AS lifecycle WHERE lifecycle.user_id = p_user_id FOR SHARE;
  IF coalesce(lifecycle_state, 'active') <> 'active' THEN
    RETURN QUERY SELECT 'restricted'::text, null::timestamptz, null::timestamptz, null::timestamptz, null::bigint;
    RETURN;
  END IF;
  SELECT * INTO target_post FROM public.posts AS post WHERE post.id = p_post_id FOR UPDATE;
  IF NOT FOUND OR target_post.author_id IS DISTINCT FROM p_user_id THEN
    RETURN QUERY SELECT 'not_found'::text, null::timestamptz, null::timestamptz, null::timestamptz, null::bigint;
    RETURN;
  END IF;
  IF target_post.trashed_at IS NULL THEN
    RETURN QUERY SELECT 'already_active'::text, null::timestamptz, null::timestamptz, null::timestamptz, target_post.trash_generation;
    RETURN;
  END IF;
  IF target_post.restore_until <= clock_timestamp() OR target_post.trash_lease_token IS NOT NULL THEN
    RETURN QUERY SELECT 'expired'::text, target_post.trashed_at, target_post.restore_until, target_post.trash_purge_due_at, target_post.trash_generation;
    RETURN;
  END IF;
  PERFORM 1 FROM public.posts AS replacement
  WHERE replacement.author_id = p_user_id AND replacement.local_date = target_post.local_date
    AND replacement.trashed_at IS NULL AND replacement.id <> p_post_id LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT 'day_occupied'::text, target_post.trashed_at, target_post.restore_until, target_post.trash_purge_due_at, target_post.trash_generation;
    RETURN;
  END IF;
  IF target_post.trash_generation >= 9007199254740991 THEN
    RETURN QUERY SELECT 'conflict'::text, null::timestamptz, null::timestamptz, null::timestamptz, null::bigint;
    RETURN;
  END IF;
  BEGIN
    RETURN QUERY UPDATE public.posts AS post SET
      trashed_at = null, restore_until = null, trash_purge_due_at = null,
      trash_lease_token = null, trash_lease_expires_at = null,
      trash_failure_category = null, trash_next_attempt_at = null,
      trash_generation = target_post.trash_generation + 1,
      updated_at = clock_timestamp()
    WHERE post.id = p_post_id AND post.restore_until > clock_timestamp() AND post.trash_lease_token IS NULL
    RETURNING 'restored'::text, post.trashed_at, post.restore_until, post.trash_purge_due_at, post.trash_generation;
  EXCEPTION WHEN unique_violation THEN
    RETURN QUERY SELECT 'day_occupied'::text, target_post.trashed_at, target_post.restore_until, target_post.trash_purge_due_at, target_post.trash_generation;
    RETURN;
  END;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'expired'::text, target_post.trashed_at, target_post.restore_until, target_post.trash_purge_due_at, target_post.trash_generation;
  END IF;
END;
$$;--> statement-breakpoint

CREATE FUNCTION public.claim_post_trash_cleanup(
  p_limit integer,
  p_lease_token text,
  p_lease_seconds integer
)
RETURNS TABLE(post_id text, generation bigint, lease_token text, object_keys text[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  candidate public.posts%ROWTYPE;
  reservation_keys text[];
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 25
    OR p_lease_token IS NULL OR char_length(p_lease_token) NOT BETWEEN 1 AND 200
    OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 10 AND 300 THEN
    RETURN;
  END IF;

  FOR candidate IN
    SELECT post.* FROM public.posts AS post
    WHERE post.trashed_at IS NOT NULL
      AND post.trash_purge_due_at <= clock_timestamp()
      AND (post.trash_lease_expires_at IS NULL OR post.trash_lease_expires_at <= clock_timestamp())
      AND (post.trash_next_attempt_at IS NULL OR post.trash_next_attempt_at <= clock_timestamp())
      AND NOT EXISTS (
        SELECT 1 FROM public.account_lifecycles lifecycle
        WHERE lifecycle.user_id = post.author_id AND lifecycle.state <> 'active'
      )
    ORDER BY post.trash_purge_due_at, post.id
    LIMIT p_limit
  LOOP
    -- Match post commands: advisory lock, account lock, then post lock. Recheck
    -- all deadlines after the post lock because the initial candidate is stale.
    PERFORM pg_advisory_xact_lock(hashtextextended('posts:author:' || candidate.author_id, 734));
    PERFORM 1 FROM public."user" WHERE id = candidate.author_id FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;
    SELECT * INTO candidate FROM public.posts AS post
    WHERE post.id = candidate.id AND post.trashed_at IS NOT NULL
      AND post.trash_purge_due_at <= clock_timestamp()
      AND (post.trash_lease_expires_at IS NULL OR post.trash_lease_expires_at <= clock_timestamp())
      AND (post.trash_next_attempt_at IS NULL OR post.trash_next_attempt_at <= clock_timestamp())
    FOR UPDATE SKIP LOCKED;
    IF NOT FOUND OR EXISTS (
      SELECT 1 FROM public.account_lifecycles lifecycle
      WHERE lifecycle.user_id = candidate.author_id AND lifecycle.state <> 'active'
    ) THEN CONTINUE; END IF;
    -- Legacy objects have no supported R2 cleanup provenance. Never remove a
    -- post that contains one, and never attempt a guessed object key.
    IF EXISTS (
      SELECT 1 FROM public.post_media media
      LEFT JOIN public.media_reservation reservation ON reservation.id = media.reservation_id
      LEFT JOIN public.legacy_cloudinary_media legacy ON legacy.media_id = media.id
      WHERE media.post_id = candidate.id
        AND (media.reservation_id IS NULL OR reservation.id IS NULL OR legacy.media_id IS NOT NULL)
    ) THEN
      UPDATE public.posts SET trash_failure_category = 'unsupported_media',
        trash_next_attempt_at = NULL, trash_lease_token = NULL, trash_lease_expires_at = NULL,
        updated_at = clock_timestamp()
      WHERE id = candidate.id;
      CONTINUE;
    END IF;

    -- Lock every reservation before testing references. A normal attachment
    -- cannot race this check because it locks the same reservation row.
    PERFORM 1 FROM public.media_reservation reservation
    WHERE reservation.id IN (
      SELECT media.reservation_id FROM public.post_media media WHERE media.post_id = candidate.id
    ) FOR UPDATE;

    IF EXISTS (
      SELECT 1 FROM public.post_media media
      WHERE media.reservation_id IN (
        SELECT own_media.reservation_id FROM public.post_media own_media WHERE own_media.post_id = candidate.id
      ) AND media.post_id <> candidate.id
    ) OR EXISTS (
      SELECT 1 FROM public.profile_avatars avatar
      WHERE avatar.reservation_id IN (
        SELECT media.reservation_id FROM public.post_media media WHERE media.post_id = candidate.id
      )
    ) THEN
      UPDATE public.posts SET trash_failure_category = 'shared_media',
        trash_next_attempt_at = NULL, trash_lease_token = NULL, trash_lease_expires_at = NULL,
        updated_at = clock_timestamp()
      WHERE id = candidate.id;
      CONTINUE;
    END IF;

    SELECT coalesce(array_agg(reservation.object_key ORDER BY reservation.id), ARRAY[]::text[])
    INTO reservation_keys
    FROM public.media_reservation reservation
    WHERE reservation.id IN (
      SELECT media.reservation_id FROM public.post_media media WHERE media.post_id = candidate.id
    );

    UPDATE public.posts SET trash_lease_token = p_lease_token,
      trash_lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
      trash_failure_category = NULL, trash_next_attempt_at = NULL, updated_at = clock_timestamp()
    WHERE id = candidate.id;

    RETURN QUERY SELECT candidate.id, candidate.trash_generation, p_lease_token, reservation_keys;
  END LOOP;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.claim_post_trash_cleanup(integer, text, integer) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.claim_post_trash_cleanup(integer, text, integer) TO lifecycle_worker;--> statement-breakpoint

CREATE FUNCTION public.complete_post_trash_cleanup(
  p_post_id text,
  p_generation bigint,
  p_lease_token text
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  target public.posts%ROWTYPE;
  owner_id text;
  reservation_ids text[];
BEGIN
  SELECT author_id INTO owner_id FROM public.posts WHERE id = p_post_id;
  IF NOT FOUND THEN RETURN 'fenced'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('posts:author:' || owner_id, 734));
  PERFORM 1 FROM public."user" WHERE id = owner_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'fenced'; END IF;
  SELECT * INTO target FROM public.posts WHERE id = p_post_id FOR UPDATE;
  IF NOT FOUND OR target.trash_generation <> p_generation
    OR target.trash_lease_token IS DISTINCT FROM p_lease_token
    OR target.trash_lease_expires_at <= clock_timestamp() THEN
    RETURN 'fenced';
  END IF;
  IF target.trashed_at IS NULL OR target.trash_purge_due_at > clock_timestamp()
    OR EXISTS (SELECT 1 FROM public.account_lifecycles lifecycle
      WHERE lifecycle.user_id = target.author_id AND lifecycle.state <> 'active') THEN
    RETURN 'fenced';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.post_media media
    LEFT JOIN public.media_reservation reservation ON reservation.id = media.reservation_id
    LEFT JOIN public.legacy_cloudinary_media legacy ON legacy.media_id = media.id
    WHERE media.post_id = target.id
      AND (media.reservation_id IS NULL OR reservation.id IS NULL OR legacy.media_id IS NOT NULL)
  ) OR EXISTS (
    SELECT 1 FROM public.post_media media
    WHERE media.reservation_id IN (SELECT own_media.reservation_id FROM public.post_media own_media WHERE own_media.post_id = target.id)
      AND media.post_id <> target.id
  ) OR EXISTS (
    SELECT 1 FROM public.profile_avatars avatar
    WHERE avatar.reservation_id IN (SELECT media.reservation_id FROM public.post_media media WHERE media.post_id = target.id)
  ) THEN
    UPDATE public.posts SET trash_failure_category = 'shared_media', trash_lease_token = NULL,
      trash_lease_expires_at = NULL, trash_next_attempt_at = NULL, updated_at = clock_timestamp()
    WHERE id = target.id;
    RETURN 'shared_media';
  END IF;

  SELECT coalesce(array_agg(media.reservation_id), ARRAY[]::text[]) INTO reservation_ids
  FROM public.post_media media WHERE media.post_id = target.id;
  DELETE FROM public.legacy_cloudinary_media WHERE media_id IN (SELECT id FROM public.post_media WHERE post_id = target.id);
  DELETE FROM public.tomorrow_notes WHERE post_id = target.id;
  DELETE FROM public.post_revisions WHERE post_id = target.id;
  DELETE FROM public.post_media WHERE post_id = target.id;
  DELETE FROM public.media_reservation reservation
  WHERE reservation.id = ANY(reservation_ids)
    AND NOT EXISTS (SELECT 1 FROM public.post_media media WHERE media.reservation_id = reservation.id)
    AND NOT EXISTS (SELECT 1 FROM public.profile_avatars avatar WHERE avatar.reservation_id = reservation.id);
  DELETE FROM public.posts WHERE id = target.id;
  RETURN 'deleted';
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.complete_post_trash_cleanup(text, bigint, text) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.complete_post_trash_cleanup(text, bigint, text) TO lifecycle_worker;--> statement-breakpoint

CREATE FUNCTION public.reschedule_post_trash_cleanup(
  p_post_id text,
  p_generation bigint,
  p_lease_token text,
  p_delay_seconds integer,
  p_failure_category text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_failure_category IS NULL OR char_length(p_failure_category) NOT BETWEEN 1 AND 100
    OR p_delay_seconds IS NOT NULL AND p_delay_seconds NOT BETWEEN 1 AND 604800 THEN
    RETURN false;
  END IF;
  UPDATE public.posts SET trash_lease_token = NULL, trash_lease_expires_at = NULL,
    trash_failure_category = p_failure_category,
    trash_next_attempt_at = CASE WHEN p_delay_seconds IS NULL THEN NULL
      ELSE clock_timestamp() + make_interval(secs => p_delay_seconds) END,
    updated_at = clock_timestamp()
  WHERE id = p_post_id AND trash_generation = p_generation
    AND trash_lease_token = p_lease_token;
  RETURN FOUND;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.reschedule_post_trash_cleanup(text, bigint, text, integer, text) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.reschedule_post_trash_cleanup(text, bigint, text, integer, text) TO lifecycle_worker;--> statement-breakpoint

-- The worker never gets table DML. Security definer procedures above run as
-- migrator and are constrained to a single leased post generation.
REVOKE ALL ON TABLE public.posts, public.post_media, public.post_revisions,
  public.tomorrow_notes, public.media_reservation, public.profile_avatars
  FROM lifecycle_worker;--> statement-breakpoint
