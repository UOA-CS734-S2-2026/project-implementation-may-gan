-- Account purge execution remains default-off. Only the migration owner can
-- open a short execution window. The scheduled Worker receives report access,
-- but no runtime in this release invokes destructive cleanup.
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.account_purge_operator_control (
  singleton boolean PRIMARY KEY DEFAULT true,
  paused boolean NOT NULL DEFAULT true,
  execute_until timestamptz,
  generation bigint NOT NULL DEFAULT 1,
  reason text NOT NULL DEFAULT 'default_off',
  actor text NOT NULL DEFAULT current_user,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT account_purge_operator_control_singleton_check CHECK (singleton),
  CONSTRAINT account_purge_operator_control_generation_check CHECK (generation > 0),
  CONSTRAINT account_purge_operator_control_reason_check CHECK (char_length(reason) BETWEEN 1 AND 200),
  CONSTRAINT account_purge_operator_control_actor_check CHECK (char_length(actor) BETWEEN 1 AND 200),
  CONSTRAINT account_purge_operator_control_state_check CHECK (
    (paused AND execute_until IS NULL) OR
    (NOT paused AND execute_until IS NOT NULL AND execute_until <= updated_at + interval '15 minutes')
  )
);--> statement-breakpoint
INSERT INTO public.account_purge_operator_control (singleton) VALUES (true) ON CONFLICT DO NOTHING;--> statement-breakpoint
REVOKE ALL ON TABLE public.account_purge_operator_control FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint

-- This owner-only control is intended for a protected database workflow. A
-- pause fences current leases before it returns. Resume is time-bounded and
-- therefore becomes paused in effect if operator refresh stops.
CREATE FUNCTION public.set_account_purge_operator_pause(
  p_paused boolean, p_execute_until timestamptz, p_reason text, p_actor text
) RETURNS boolean
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_now timestamptz;
BEGIN
  v_now := clock_timestamp();
  IF p_paused IS NULL OR p_reason IS NULL OR char_length(p_reason) NOT BETWEEN 1 AND 200
    OR p_actor IS NULL OR char_length(p_actor) NOT BETWEEN 1 AND 200
    OR (p_paused AND p_execute_until IS NOT NULL)
    OR (NOT p_paused AND (p_execute_until IS NULL OR p_execute_until <= v_now
      OR p_execute_until > v_now + interval '15 minutes')) THEN
    RETURN false;
  END IF;
  UPDATE public.account_purge_operator_control SET paused = p_paused,
    execute_until = CASE WHEN p_paused THEN NULL ELSE p_execute_until END,
    generation = generation + 1, reason = p_reason, actor = p_actor, updated_at = v_now
    WHERE singleton;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_paused THEN
    UPDATE public.account_purge_object_cleanup_tasks SET status = 'failed',
      next_attempt_at = v_now, lease_token = NULL, lease_expires_at = NULL,
      failure_category = 'operator_pause', updated_at = v_now WHERE status = 'deleting';
    UPDATE public.account_lifecycles SET state = 'purge_failed', next_attempt_at = v_now,
      lease_token = NULL, lease_expires_at = NULL, last_error_category = 'operator_pause',
      updated_at = v_now WHERE state = 'purging';
  END IF;
  RETURN true;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.set_account_purge_operator_pause(boolean, timestamptz, text, text) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint

-- Keep the original claim implementation private behind the persistent gate.
ALTER FUNCTION public.claim_account_purge_cleanup(integer, text, integer)
  RENAME TO claim_account_purge_cleanup_without_operator_gate;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.claim_account_purge_cleanup_without_operator_gate(integer, text, integer)
  FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
CREATE FUNCTION public.claim_account_purge_cleanup(p_limit integer, p_lease_token text, p_lease_seconds integer)
RETURNS TABLE(task_id text, owner_id text, lifecycle_generation bigint, object_key text,
  export_cleanup_task_id text, export_upload_id text, lease_token text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_control public.account_purge_operator_control%ROWTYPE;
BEGIN
  SELECT control.* INTO v_control FROM public.account_purge_operator_control control
    WHERE control.singleton FOR SHARE;
  IF NOT FOUND OR v_control.paused OR v_control.execute_until IS NULL
    OR v_control.execute_until <= clock_timestamp()
    OR v_control.updated_at + interval '15 minutes' <= clock_timestamp() THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT * FROM public.claim_account_purge_cleanup_without_operator_gate(
    p_limit, p_lease_token, p_lease_seconds);
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.claim_account_purge_cleanup(integer, text, integer) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint

-- Every provider call must re-check both the short operator window and the
-- exact task and lifecycle leases. Missing state, expiry, pause, or recovery
-- by a competing worker all return false.
CREATE FUNCTION public.authorize_account_purge_cleanup(
  p_task_id text, p_generation bigint, p_lease_token text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_control public.account_purge_operator_control%ROWTYPE;
BEGIN
  SELECT control.* INTO v_control FROM public.account_purge_operator_control control
    WHERE control.singleton FOR SHARE;
  IF NOT FOUND OR v_control.paused OR v_control.execute_until IS NULL
    OR v_control.execute_until <= clock_timestamp()
    OR v_control.updated_at + interval '15 minutes' <= clock_timestamp() THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.account_purge_object_cleanup_tasks task
    JOIN public.account_lifecycles lifecycle ON lifecycle.user_id = task.user_id
    WHERE task.id = p_task_id AND task.status = 'deleting'
      AND task.lease_token = p_lease_token AND task.lease_expires_at > clock_timestamp()
      AND lifecycle.generation = p_generation AND lifecycle.state = 'purging'
      AND lifecycle.lease_token = p_lease_token AND lifecycle.lease_expires_at > clock_timestamp()
  );
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.authorize_account_purge_cleanup(text, bigint, text) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint

-- Storage retries stop after eight claims. Terminal lifecycle state is visible
-- through both aggregate reports and requires an owner-reviewed recovery.
CREATE OR REPLACE FUNCTION public.retry_account_purge_cleanup(
  p_task_id text, p_generation bigint, p_lease_token text, p_delay_seconds integer
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_user_id text; v_now timestamptz; v_terminal boolean;
BEGIN
  IF p_delay_seconds IS NULL OR p_delay_seconds NOT BETWEEN 30 AND 604800 THEN RETURN false; END IF;
  SELECT task.user_id, task.attempt_count >= 8 INTO v_user_id, v_terminal
    FROM public.account_purge_object_cleanup_tasks task WHERE task.id = p_task_id;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public."user" person WHERE person.id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public.account_lifecycles lifecycle WHERE lifecycle.user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public.account_purge_object_cleanup_tasks task WHERE task.id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  v_now := clock_timestamp();
  UPDATE public.account_purge_object_cleanup_tasks task SET status = 'failed',
    lease_token = NULL, lease_expires_at = NULL,
    next_attempt_at = CASE WHEN v_terminal THEN 'infinity'::timestamptz
      ELSE v_now + make_interval(secs => p_delay_seconds) END,
    failure_category = CASE WHEN v_terminal THEN 'storage_terminal' ELSE 'storage' END,
    updated_at = v_now WHERE task.id = p_task_id AND task.status = 'deleting'
      AND task.lease_token = p_lease_token AND task.lease_expires_at > v_now;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.account_lifecycles lifecycle SET state = 'purge_failed',
    last_error_category = CASE WHEN v_terminal THEN 'storage_terminal' ELSE 'storage' END,
    next_attempt_at = CASE WHEN v_terminal THEN 'infinity'::timestamptz
      ELSE v_now + make_interval(secs => p_delay_seconds) END,
    lease_token = NULL, lease_expires_at = NULL, updated_at = v_now
    WHERE lifecycle.user_id = v_user_id AND lifecycle.generation = p_generation
      AND lifecycle.state = 'purging' AND lifecycle.lease_token = p_lease_token
      AND lifecycle.lease_expires_at > v_now;
  RETURN FOUND;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.retry_account_purge_cleanup(text, bigint, text, integer) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.retry_account_purge_cleanup(text, bigint, text, integer) TO lifecycle_worker;--> statement-breakpoint

CREATE FUNCTION public.report_account_purge_operator_control()
RETURNS TABLE(paused boolean, control_present boolean, control_fresh boolean, terminal_cleanup_count bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT coalesce(bool_and(control.paused), true), count(*) = 1,
    coalesce(bool_and(NOT control.paused AND control.execute_until > clock_timestamp()
      AND control.updated_at + interval '15 minutes' > clock_timestamp()), false),
    (SELECT count(*) FROM public.account_purge_object_cleanup_tasks task
      WHERE task.status = 'failed' AND task.next_attempt_at = 'infinity'::timestamptz)
  FROM public.account_purge_operator_control control WHERE control.singleton;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.report_account_purge_operator_control() FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.report_account_purge_operator_control() TO lifecycle_worker;--> statement-breakpoint

-- This release has no physical purge executor. Keep the restricted worker on
-- aggregate reports only. A later protected executor must introduce a new role
-- and an atomic permit protocol rather than reusing these provisional calls.
REVOKE ALL ON FUNCTION public.claim_account_purge_cleanup(integer, text, integer) FROM lifecycle_worker;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.authorize_account_purge_cleanup(text, bigint, text) FROM lifecycle_worker;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.complete_account_purge_cleanup(text, bigint, text) FROM lifecycle_worker;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.retry_account_purge_cleanup(text, bigint, text, integer) FROM lifecycle_worker;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.delete_expired_account_purge_receipts(integer) FROM lifecycle_worker;--> statement-breakpoint
