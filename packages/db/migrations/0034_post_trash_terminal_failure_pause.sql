-- squawk-ignore-file prefer-robust-stmts
-- A terminal media finding must not remain the oldest eligible cleanup
-- candidate forever. An operator can investigate and schedule a later retry
-- through a separately reviewed procedure or forward migration.
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
CREATE FUNCTION public.pause_terminal_post_trash_failure()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.trashed_at IS NOT NULL
    AND NEW.trash_failure_category IN ('unsupported_media', 'shared_media')
    AND NEW.trash_next_attempt_at IS NULL THEN
    NEW.trash_next_attempt_at := 'infinity'::timestamptz;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.pause_terminal_post_trash_failure() FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
CREATE TRIGGER posts_trash_terminal_failure_pause BEFORE UPDATE ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.pause_terminal_post_trash_failure();--> statement-breakpoint
-- These rows can only come from disabled synthetic workers at rollout time.
-- Repair them before they can repeatedly consume a bounded claim's LIMIT.
UPDATE public.posts SET trash_next_attempt_at = 'infinity'::timestamptz
WHERE trashed_at IS NOT NULL AND trash_failure_category IN ('unsupported_media', 'shared_media')
  AND trash_next_attempt_at IS NULL;
