-- squawk-ignore-file prefer-robust-stmts
-- squawk-ignore-file constraint-missing-not-valid
-- This validation follows the capped small-table Post Trash migration in the
-- same rollout. Do not install against a larger posts table without a new plan.
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
DO $$
BEGIN
  IF pg_relation_size('public.posts'::regclass) > 16 * 1024 * 1024 THEN
    RAISE EXCEPTION 'Post Trash constraint needs a reviewed large-table migration plan.';
  END IF;
END;
$$;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_trash_deadline_presence_check" CHECK (
  "posts"."trashed_at" is null or
  ("posts"."restore_until" is not null and "posts"."trash_purge_due_at" is not null)
);
