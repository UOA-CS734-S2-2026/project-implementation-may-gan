-- squawk-ignore-file prefer-robust-stmts
-- The coordinated migration runner applies this file in one transaction. A
-- partial install must not grant a worker authority without attachment fencing.
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint

-- 0030 used statement_timestamp(), which starts before lock waits. A single
-- clock value captured after every lock gives the full restore period.
CREATE OR REPLACE FUNCTION public.move_post_to_trash(p_user_id text, p_session_id text, p_post_id text)
RETURNS TABLE(outcome text, trashed_at timestamptz, restore_until timestamptz, purge_due_at timestamptz, generation bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  target_post public.posts%ROWTYPE;
  lifecycle_state public.account_lifecycle_state;
  decision_at timestamptz;
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
  WHERE active_session.id = p_session_id AND active_session.user_id = p_user_id
    AND active_session.expires_at > clock_timestamp() FOR SHARE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid_session'::text, null::timestamptz, null::timestamptz, null::timestamptz, null::bigint;
    RETURN;
  END IF;
  SELECT lifecycle.state INTO lifecycle_state FROM public.account_lifecycles AS lifecycle
    WHERE lifecycle.user_id = p_user_id FOR SHARE;
  IF coalesce(lifecycle_state, 'active') <> 'active' THEN
    RETURN QUERY SELECT 'restricted'::text, null::timestamptz, null::timestamptz, null::timestamptz, null::bigint;
    RETURN;
  END IF;
  SELECT * INTO target_post FROM public.posts AS post WHERE post.id = p_post_id FOR UPDATE;
  IF NOT FOUND OR target_post.author_id IS DISTINCT FROM p_user_id THEN
    RETURN QUERY SELECT 'not_found'::text, null::timestamptz, null::timestamptz, null::timestamptz, null::bigint;
    RETURN;
  END IF;
  IF target_post.trashed_at IS NOT NULL THEN
    RETURN QUERY SELECT 'already_trashed'::text, target_post.trashed_at, target_post.restore_until,
      target_post.trash_purge_due_at, target_post.trash_generation;
    RETURN;
  END IF;
  IF target_post.trash_generation >= 9007199254740991 THEN
    RETURN QUERY SELECT 'conflict'::text, null::timestamptz, null::timestamptz, null::timestamptz, null::bigint;
    RETURN;
  END IF;
  decision_at := clock_timestamp();
  RETURN QUERY UPDATE public.posts AS post SET
    trashed_at = decision_at, restore_until = decision_at + interval '168 hours',
    trash_purge_due_at = decision_at + interval '336 hours',
    trash_generation = target_post.trash_generation + 1, updated_at = decision_at
  WHERE post.id = p_post_id
  RETURNING 'trashed'::text, post.trashed_at, post.restore_until, post.trash_purge_due_at, post.trash_generation;
END;
$$;--> statement-breakpoint

-- A post claim must make its bytes non-attachable before the worker receives
-- object keys. The original function holds post and reservation locks until
-- this wrapper has atomically tombstoned every claimed reservation.
ALTER FUNCTION public.claim_post_trash_cleanup(integer, text, integer)
  RENAME TO claim_post_trash_cleanup_before_tombstones;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.claim_post_trash_cleanup_before_tombstones(integer, text, integer)
  FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
CREATE FUNCTION public.claim_post_trash_cleanup(p_limit integer, p_lease_token text, p_lease_seconds integer)
RETURNS TABLE(post_id text, generation bigint, lease_token text, object_keys text[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  claimed record;
BEGIN
  FOR claimed IN SELECT * FROM public.claim_post_trash_cleanup_before_tombstones(
    p_limit, p_lease_token, p_lease_seconds
  ) LOOP
    UPDATE public.media_reservation AS reservation
      SET cleanup_claimed_at = coalesce(reservation.cleanup_claimed_at, clock_timestamp())
      WHERE reservation.id IN (
        SELECT media.reservation_id FROM public.post_media AS media WHERE media.post_id = claimed.post_id
      );
    RETURN QUERY SELECT claimed.post_id, claimed.generation, claimed.lease_token, claimed.object_keys;
  END LOOP;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.claim_post_trash_cleanup(integer, text, integer)
  FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.claim_post_trash_cleanup(integer, text, integer)
  TO lifecycle_worker;--> statement-breakpoint

-- Lock the same reservation rows before the final shared-reference check.
-- Otherwise a concurrent avatar insert can win between the check and a
-- cascading reservation delete, silently losing the new avatar.
ALTER FUNCTION public.complete_post_trash_cleanup(text, bigint, text)
  RENAME TO complete_post_trash_cleanup_without_reference_locks;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.complete_post_trash_cleanup_without_reference_locks(text, bigint, text)
  FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
CREATE FUNCTION public.complete_post_trash_cleanup(p_post_id text, p_generation bigint, p_lease_token text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  owner_id text;
BEGIN
  IF p_post_id IS NULL OR p_generation IS NULL OR p_lease_token IS NULL
    OR char_length(p_lease_token) NOT BETWEEN 1 AND 200 THEN RETURN 'fenced'; END IF;
  SELECT post.author_id INTO owner_id FROM public.posts AS post WHERE post.id = p_post_id;
  IF NOT FOUND THEN RETURN 'fenced'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('posts:author:' || owner_id, 734));
  PERFORM 1 FROM public."user" AS owner WHERE owner.id = owner_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'fenced'; END IF;
  PERFORM 1 FROM public.posts AS post WHERE post.id = p_post_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'fenced'; END IF;
  PERFORM reservation.id FROM public.media_reservation AS reservation
    WHERE reservation.id IN (
      SELECT media.reservation_id FROM public.post_media AS media WHERE media.post_id = p_post_id
    ) ORDER BY reservation.id FOR UPDATE;
  RETURN public.complete_post_trash_cleanup_without_reference_locks(p_post_id, p_generation, p_lease_token);
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.complete_post_trash_cleanup(text, bigint, text)
  FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.complete_post_trash_cleanup(text, bigint, text)
  TO lifecycle_worker;--> statement-breakpoint

-- A timed-out worker may not extend or clear a lease after it expires.
-- Serializing with account deletion also prevents a stale retry from
-- changing cleanup state after the account lifecycle becomes pending.
CREATE OR REPLACE FUNCTION public.reschedule_post_trash_cleanup(
  p_post_id text, p_generation bigint, p_lease_token text,
  p_delay_seconds integer, p_failure_category text
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  owner_id text;
BEGIN
  IF p_post_id IS NULL OR p_generation IS NULL OR p_lease_token IS NULL
    OR char_length(p_lease_token) NOT BETWEEN 1 AND 200
    OR p_failure_category IS NULL OR char_length(p_failure_category) NOT BETWEEN 1 AND 100
    OR p_delay_seconds IS NOT NULL AND p_delay_seconds NOT BETWEEN 1 AND 604800 THEN
    RETURN false;
  END IF;
  SELECT post.author_id INTO owner_id FROM public.posts AS post WHERE post.id = p_post_id;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('posts:author:' || owner_id, 734));
  PERFORM 1 FROM public."user" AS owner WHERE owner.id = owner_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.posts AS post SET trash_lease_token = NULL, trash_lease_expires_at = NULL,
    trash_failure_category = p_failure_category,
    trash_next_attempt_at = CASE WHEN p_delay_seconds IS NULL THEN NULL
      ELSE clock_timestamp() + make_interval(secs => p_delay_seconds) END,
    updated_at = clock_timestamp()
  WHERE post.id = p_post_id AND post.trash_generation = p_generation
    AND post.trash_lease_token = p_lease_token AND post.trash_lease_expires_at > clock_timestamp()
    AND post.trashed_at IS NOT NULL AND post.trash_purge_due_at <= clock_timestamp()
    AND NOT EXISTS (SELECT 1 FROM public.account_lifecycles AS lifecycle
      WHERE lifecycle.user_id = owner_id AND lifecycle.state <> 'active');
  RETURN FOUND;
END;
$$;--> statement-breakpoint

-- Both attachment paths recheck after acquiring the reservation lock. The
-- database guard protects against a future route omitting the application
-- check and also covers a racing owner transaction.
CREATE FUNCTION public.reject_claimed_media_attachment()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  claimed_at timestamptz;
BEGIN
  IF NEW.reservation_id IS NULL THEN RETURN NEW; END IF;
  SELECT reservation.cleanup_claimed_at INTO claimed_at
    FROM public.media_reservation AS reservation WHERE reservation.id = NEW.reservation_id FOR UPDATE;
  IF claimed_at IS NOT NULL THEN
    RAISE EXCEPTION 'A cleanup-claimed upload cannot be attached' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.reject_claimed_media_attachment() FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
CREATE TRIGGER post_media_claimed_attachment_guard BEFORE INSERT OR UPDATE OF reservation_id ON public.post_media
  FOR EACH ROW EXECUTE FUNCTION public.reject_claimed_media_attachment();--> statement-breakpoint
CREATE TRIGGER profile_avatars_claimed_attachment_guard BEFORE INSERT OR UPDATE OF reservation_id ON public.profile_avatars
  FOR EACH ROW EXECUTE FUNCTION public.reject_claimed_media_attachment();--> statement-breakpoint

-- Report-only discovery never acquires a lease, selects object keys, or
-- changes cleanup state. Operational activation remains a separate decision.
CREATE FUNCTION public.report_post_trash_cleanup()
RETURNS TABLE(due_count bigint, failed_count bigint, leased_count bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT count(*) FILTER (WHERE post.trash_purge_due_at <= clock_timestamp()
    AND (post.trash_next_attempt_at IS NULL OR post.trash_next_attempt_at <= clock_timestamp())
    AND (post.trash_lease_expires_at IS NULL OR post.trash_lease_expires_at <= clock_timestamp())) AS due_count,
    count(*) FILTER (WHERE post.trash_failure_category IS NOT NULL) AS failed_count,
    count(*) FILTER (WHERE post.trash_lease_expires_at > clock_timestamp()) AS leased_count
  FROM public.posts AS post
  WHERE post.trashed_at IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.account_lifecycles AS lifecycle
      WHERE lifecycle.user_id = post.author_id AND lifecycle.state <> 'active');
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.report_post_trash_cleanup() FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.report_post_trash_cleanup() TO lifecycle_worker;
