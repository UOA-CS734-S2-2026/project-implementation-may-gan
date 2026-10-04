-- A generation change or irreversible purge clears ready archive access in
-- the same transaction and makes its already-owned object cleanup due now.
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
CREATE FUNCTION public.fence_exports_on_lifecycle_transition()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_request public.data_export_requests%ROWTYPE;
  v_task_id text;
  v_now timestamptz;
  v_prefix text;
BEGIN
  IF NEW.generation = OLD.generation AND NEW.state <> 'purging' THEN RETURN NEW; END IF;
  v_now := clock_timestamp();
  FOR v_request IN SELECT requests.* FROM public.data_export_requests requests
    WHERE requests.user_id = NEW.user_id AND requests.status IN ('requested', 'building', 'ready')
    FOR UPDATE
  LOOP
    v_task_id := NULL;
    IF v_request.status = 'ready' THEN
      SELECT task.id INTO v_task_id FROM public.data_export_object_cleanup_tasks task
        WHERE task.archive_object_key = v_request.archive_object_key
        ORDER BY task.created_at, task.id LIMIT 1 FOR UPDATE;
      IF NOT FOUND THEN
        v_task_id := 'export_cleanup_' || encode(sha256(convert_to(v_request.id, 'UTF8')), 'hex');
        INSERT INTO public.data_export_object_cleanup_tasks
          (id, archive_object_key, status, next_attempt_at)
          VALUES (v_task_id, v_request.archive_object_key, 'pending', v_now)
          ON CONFLICT (id) DO NOTHING;
      END IF;
      PERFORM 1 FROM public.data_export_object_cleanup_tasks task
        WHERE task.id = v_task_id AND task.archive_object_key = v_request.archive_object_key FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Export cleanup ownership conflict'; END IF;
      UPDATE public.data_export_object_cleanup_tasks task SET next_attempt_at = v_now,
        updated_at = v_now WHERE task.id = v_task_id AND task.status IN ('pending', 'failed');
    ELSIF v_request.status = 'building' THEN
      v_prefix := 'private/data-exports/v2/' || encode(sha256(convert_to(v_request.id, 'UTF8')), 'hex') || '/%';
      UPDATE public.data_export_object_cleanup_tasks task SET next_attempt_at = v_now,
        updated_at = v_now WHERE task.archive_object_key LIKE v_prefix
          AND task.status IN ('pending', 'failed');
    END IF;
    UPDATE public.data_export_requests requests SET status = 'cancelled',
      snapshot_cutoff_at = NULL, archive_object_key = NULL, archive_cleanup_task_id = v_task_id,
      ready_at = NULL, expires_at = NULL, lease_token = NULL, lease_expires_at = NULL,
      updated_at = v_now WHERE requests.id = v_request.id;
  END LOOP;
  RETURN NEW;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.fence_exports_on_lifecycle_transition() FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
CREATE TRIGGER fence_exports_on_lifecycle_transition
  AFTER UPDATE OF state, generation ON public.account_lifecycles
  FOR EACH ROW
  WHEN (NEW.generation IS DISTINCT FROM OLD.generation OR (NEW.state = 'purging' AND OLD.state IS DISTINCT FROM 'purging'))
  EXECUTE FUNCTION public.fence_exports_on_lifecycle_transition();--> statement-breakpoint
