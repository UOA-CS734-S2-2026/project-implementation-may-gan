-- squawk-ignore-file prefer-robust-stmts
-- squawk-ignore-file require-concurrent-index-creation
-- squawk-ignore-file constraint-missing-not-valid
-- The migration runner wraps each file in a transaction. This nonconcurrent
-- index build is allowed only for a measured small posts table. A larger
-- environment must get a separate reviewed migration plan before rollout.
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
DO $$
BEGIN
  IF pg_relation_size('public.posts'::regclass) > 16 * 1024 * 1024 THEN
    RAISE EXCEPTION 'Post Trash index needs a reviewed large-table migration plan.';
  END IF;
END;
$$;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "trashed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "restore_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "trash_purge_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "trash_generation" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "trash_lease_token" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "trash_lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "trash_failure_category" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "trash_next_attempt_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "posts_author_local_date_active_unique" ON "posts" USING btree ("author_id","local_date") WHERE "posts"."trashed_at" is null;--> statement-breakpoint
ALTER TABLE "posts" DROP CONSTRAINT "posts_author_local_date_unique";--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_trash_generation_check" CHECK ("posts"."trash_generation" between 0 and 9007199254740991);--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_trash_deadlines_check" CHECK (
    ("posts"."trashed_at" is null and "posts"."restore_until" is null and "posts"."trash_purge_due_at" is null and
      "posts"."trash_lease_token" is null and "posts"."trash_lease_expires_at" is null and
      "posts"."trash_failure_category" is null and "posts"."trash_next_attempt_at" is null) or
    ("posts"."trashed_at" is not null and "posts"."restore_until" = "posts"."trashed_at" + interval '168 hours' and
      "posts"."trash_purge_due_at" = "posts"."trashed_at" + interval '336 hours')
  );--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_trash_lease_pair_check" CHECK (("posts"."trash_lease_token" is null) = ("posts"."trash_lease_expires_at" is null));--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_trash_failure_category_check" CHECK ("posts"."trash_failure_category" is null or char_length("posts"."trash_failure_category") between 1 and 100);--> statement-breakpoint
-- Direct app updates cannot rewrite Trash deadlines or impersonate a cleanup lease.
CREATE FUNCTION public.guard_post_trash_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF current_user <> 'migrator' AND (
    OLD.trashed_at IS DISTINCT FROM NEW.trashed_at OR
    OLD.restore_until IS DISTINCT FROM NEW.restore_until OR
    OLD.trash_purge_due_at IS DISTINCT FROM NEW.trash_purge_due_at OR
    OLD.trash_generation IS DISTINCT FROM NEW.trash_generation OR
    OLD.trash_lease_token IS DISTINCT FROM NEW.trash_lease_token OR
    OLD.trash_lease_expires_at IS DISTINCT FROM NEW.trash_lease_expires_at OR
    OLD.trash_failure_category IS DISTINCT FROM NEW.trash_failure_category OR
    OLD.trash_next_attempt_at IS DISTINCT FROM NEW.trash_next_attempt_at
  ) THEN
    RAISE EXCEPTION 'Post Trash state requires a reviewed procedure' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.guard_post_trash_fields() FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
CREATE TRIGGER posts_trash_fields_guard BEFORE UPDATE ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.guard_post_trash_fields();--> statement-breakpoint
REVOKE DELETE ON TABLE public.posts FROM app;--> statement-breakpoint
CREATE FUNCTION public.move_post_to_trash(p_user_id text, p_session_id text, p_post_id text)
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
  -- Match create-post's transaction lock before the account row lock.
  PERFORM pg_advisory_xact_lock(hashtextextended('posts:author:' || p_user_id, 734));
  PERFORM 1 FROM public."user" WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, null::timestamptz, null::timestamptz, null::timestamptz, null::bigint;
    RETURN;
  END IF;
  PERFORM 1 FROM public.session
  WHERE id = p_session_id AND user_id = p_user_id AND expires_at > clock_timestamp() FOR SHARE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid_session'::text, null::timestamptz, null::timestamptz, null::timestamptz, null::bigint;
    RETURN;
  END IF;
  SELECT state INTO lifecycle_state FROM public.account_lifecycles WHERE user_id = p_user_id FOR SHARE;
  IF coalesce(lifecycle_state, 'active') <> 'active' THEN
    RETURN QUERY SELECT 'restricted'::text, null::timestamptz, null::timestamptz, null::timestamptz, null::bigint;
    RETURN;
  END IF;
  SELECT * INTO target_post FROM public.posts WHERE id = p_post_id FOR UPDATE;
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
  RETURN QUERY UPDATE public.posts AS post SET
    trashed_at = statement_timestamp(),
    restore_until = statement_timestamp() + interval '168 hours',
    trash_purge_due_at = statement_timestamp() + interval '336 hours',
    trash_generation = target_post.trash_generation + 1,
    updated_at = statement_timestamp()
  WHERE post.id = p_post_id
  RETURNING 'trashed'::text, post.trashed_at, post.restore_until, post.trash_purge_due_at, post.trash_generation;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.move_post_to_trash(text, text, text) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.move_post_to_trash(text, text, text) TO app;--> statement-breakpoint
CREATE FUNCTION public.restore_trashed_post(p_user_id text, p_session_id text, p_post_id text)
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
  PERFORM 1 FROM public."user" WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, null::timestamptz, null::timestamptz, null::timestamptz, null::bigint;
    RETURN;
  END IF;
  PERFORM 1 FROM public.session
  WHERE id = p_session_id AND user_id = p_user_id AND expires_at > clock_timestamp() FOR SHARE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid_session'::text, null::timestamptz, null::timestamptz, null::timestamptz, null::bigint;
    RETURN;
  END IF;
  SELECT state INTO lifecycle_state FROM public.account_lifecycles WHERE user_id = p_user_id FOR SHARE;
  IF coalesce(lifecycle_state, 'active') <> 'active' THEN
    RETURN QUERY SELECT 'restricted'::text, null::timestamptz, null::timestamptz, null::timestamptz, null::bigint;
    RETURN;
  END IF;
  SELECT * INTO target_post FROM public.posts WHERE id = p_post_id FOR UPDATE;
  IF NOT FOUND OR target_post.author_id IS DISTINCT FROM p_user_id THEN
    RETURN QUERY SELECT 'not_found'::text, null::timestamptz, null::timestamptz, null::timestamptz, null::bigint;
    RETURN;
  END IF;
  IF target_post.trashed_at IS NULL THEN
    RETURN QUERY SELECT 'already_active'::text, null::timestamptz, null::timestamptz, null::timestamptz,
      target_post.trash_generation;
    RETURN;
  END IF;
  IF target_post.restore_until <= clock_timestamp() OR target_post.trash_lease_token IS NOT NULL THEN
    RETURN QUERY SELECT 'expired'::text, target_post.trashed_at, target_post.restore_until,
      target_post.trash_purge_due_at, target_post.trash_generation;
    RETURN;
  END IF;
  PERFORM 1 FROM public.posts
  WHERE author_id = p_user_id AND local_date = target_post.local_date AND trashed_at IS NULL
    AND id <> p_post_id LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT 'day_occupied'::text, target_post.trashed_at, target_post.restore_until,
      target_post.trash_purge_due_at, target_post.trash_generation;
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
    RETURN QUERY SELECT 'day_occupied'::text, target_post.trashed_at, target_post.restore_until,
      target_post.trash_purge_due_at, target_post.trash_generation;
    RETURN;
  END;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'expired'::text, target_post.trashed_at, target_post.restore_until,
      target_post.trash_purge_due_at, target_post.trash_generation;
  END IF;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.restore_trashed_post(text, text, text) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.restore_trashed_post(text, text, text) TO app;