-- squawk-ignore-file prefer-robust-stmts
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "account_purge_provider_operation_permits" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text,
	"task_id_digest" text NOT NULL,
	"owner_id" text,
	"owner_id_digest" text NOT NULL,
	"lifecycle_generation" bigint NOT NULL,
	"operator_epoch" bigint NOT NULL,
	"worker_lease_token" text,
	"worker_lease_digest" text NOT NULL,
	"operation" text NOT NULL,
	"status" text DEFAULT 'started' NOT NULL,
	"operation_deadline" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolution" text,
	"reconciled_actor_digest" text,
	"retention_expires_at" timestamp with time zone,
	CONSTRAINT "account_purge_provider_permits_generation_check" CHECK ("account_purge_provider_operation_permits"."lifecycle_generation" between 1 and 9007199254740991),
	CONSTRAINT "account_purge_provider_permits_epoch_check" CHECK ("account_purge_provider_operation_permits"."operator_epoch" > 0),
	CONSTRAINT "account_purge_provider_permits_operation_check" CHECK ("account_purge_provider_operation_permits"."operation" in ('delete_object', 'abort_export_multipart', 'verify_object_absent')),
	CONSTRAINT "account_purge_provider_permits_status_check" CHECK ("account_purge_provider_operation_permits"."status" in ('started', 'completed', 'failed', 'unresolved', 'reconciled')),
	CONSTRAINT "account_purge_provider_permits_digest_check" CHECK (
    char_length("account_purge_provider_operation_permits"."task_id_digest") = 64 and char_length("account_purge_provider_operation_permits"."owner_id_digest") = 64
      and char_length("account_purge_provider_operation_permits"."worker_lease_digest") = 64
      and ("account_purge_provider_operation_permits"."reconciled_actor_digest" is null or char_length("account_purge_provider_operation_permits"."reconciled_actor_digest") = 64)
  ),
	CONSTRAINT "account_purge_provider_permits_resolution_check" CHECK (
    ("account_purge_provider_operation_permits"."status" = 'started' and "account_purge_provider_operation_permits"."task_id" is not null and "account_purge_provider_operation_permits"."owner_id" is not null
      and "account_purge_provider_operation_permits"."worker_lease_token" is not null and "account_purge_provider_operation_permits"."resolved_at" is null and "account_purge_provider_operation_permits"."resolution" is null
      and "account_purge_provider_operation_permits"."retention_expires_at" is null) or
    ("account_purge_provider_operation_permits"."status" in ('completed', 'failed', 'reconciled') and "account_purge_provider_operation_permits"."task_id" is null and "account_purge_provider_operation_permits"."owner_id" is null
      and "account_purge_provider_operation_permits"."worker_lease_token" is null and "account_purge_provider_operation_permits"."resolved_at" is not null and "account_purge_provider_operation_permits"."resolution" is not null
      and "account_purge_provider_operation_permits"."retention_expires_at" = "account_purge_provider_operation_permits"."resolved_at" + interval '30 days') or
    ("account_purge_provider_operation_permits"."status" = 'unresolved' and "account_purge_provider_operation_permits"."task_id" is null and "account_purge_provider_operation_permits"."owner_id" is null
      and "account_purge_provider_operation_permits"."worker_lease_token" is null and "account_purge_provider_operation_permits"."resolved_at" is null and "account_purge_provider_operation_permits"."resolution" is not null
      and "account_purge_provider_operation_permits"."retention_expires_at" is null)
  )
);
--> statement-breakpoint
ALTER TABLE "account_purge_operator_control" ADD COLUMN IF NOT EXISTS "drain_state" text DEFAULT 'paused' NOT NULL;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "account_purge_provider_permits_open_idx" ON "account_purge_provider_operation_permits" USING btree ("status","operation_deadline");--> statement-breakpoint
ALTER TABLE "account_purge_operator_control" ADD CONSTRAINT "account_purge_operator_control_drain_state_check" CHECK ("account_purge_operator_control"."drain_state" in ('active', 'draining', 'paused', 'incident')) NOT VALID;--> statement-breakpoint
ALTER TABLE "account_purge_operator_control" VALIDATE CONSTRAINT "account_purge_operator_control_drain_state_check";--> statement-breakpoint

-- Existing unpaused windows remain active. All permit state is private, and no
-- runtime role receives execution rights in this release.
UPDATE public.account_purge_operator_control
SET drain_state = CASE WHEN paused THEN 'paused' ELSE 'active' END;--> statement-breakpoint
REVOKE ALL ON TABLE public.account_purge_provider_operation_permits FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint

-- Admission is the database definition of provider-operation start. It holds
-- the control-row lock only while recording durable evidence, never over R2.
-- A caller must not contact R2 unless this function returns one row.
CREATE FUNCTION public.start_account_purge_provider_operation(
  p_permit_id text, p_task_id text, p_lifecycle_generation bigint,
  p_worker_lease_token text, p_operation text, p_operation_deadline timestamptz
) RETURNS TABLE(permit_id text, operator_epoch bigint, operation_deadline timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_control public.account_purge_operator_control%ROWTYPE;
  v_owner_id text;
BEGIN
  IF p_permit_id IS NULL OR char_length(p_permit_id) NOT BETWEEN 1 AND 200
    OR p_worker_lease_token IS NULL OR char_length(p_worker_lease_token) NOT BETWEEN 1 AND 200
    OR p_operation NOT IN ('delete_object', 'abort_export_multipart', 'verify_object_absent')
    OR p_operation_deadline IS NULL OR p_operation_deadline <= v_now + interval '5 seconds'
    OR p_operation_deadline > v_now + interval '2 minutes' THEN
    RETURN;
  END IF;

  SELECT control.* INTO v_control
  FROM public.account_purge_operator_control control
  WHERE control.singleton FOR UPDATE;
  IF NOT FOUND OR v_control.paused OR v_control.drain_state <> 'active'
    OR v_control.execute_until IS NULL OR v_control.execute_until <= v_now
    OR v_control.updated_at + interval '15 minutes' <= v_now
    OR p_operation_deadline > v_control.execute_until THEN
    RETURN;
  END IF;

  SELECT task.user_id INTO v_owner_id
  FROM public.account_purge_object_cleanup_tasks task
  JOIN public.account_lifecycles lifecycle ON lifecycle.user_id = task.user_id
  WHERE task.id = p_task_id AND task.status = 'deleting'
    AND task.lease_token = p_worker_lease_token AND task.lease_expires_at > p_operation_deadline
    AND lifecycle.generation = p_lifecycle_generation AND lifecycle.state = 'purging'
    AND lifecycle.lease_token = p_worker_lease_token AND lifecycle.lease_expires_at > p_operation_deadline;
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public.account_purge_provider_operation_permits
    (id, task_id, task_id_digest, owner_id, owner_id_digest,
      lifecycle_generation, operator_epoch, worker_lease_token, worker_lease_digest,
      operation, operation_deadline, started_at)
  VALUES (p_permit_id, p_task_id,
    encode(sha256(convert_to(p_task_id, 'UTF8')), 'hex'), v_owner_id,
    encode(sha256(convert_to(v_owner_id, 'UTF8')), 'hex'), p_lifecycle_generation,
    v_control.generation, p_worker_lease_token,
    encode(sha256(convert_to(p_worker_lease_token, 'UTF8')), 'hex'),
    p_operation, p_operation_deadline, v_now);
  RETURN QUERY SELECT p_permit_id, v_control.generation, p_operation_deadline;
EXCEPTION WHEN unique_violation THEN
  RETURN;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.start_account_purge_provider_operation(text, text, bigint, text, text, timestamptz)
  FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint

-- Normal acknowledgement is accepted after a pause because the operation was
-- already admitted. A response after its deadline is not treated as proof of
-- quiescence: it becomes unresolved and requires explicit reconciliation.
CREATE FUNCTION public.finish_account_purge_provider_operation(
  p_permit_id text, p_task_id text, p_lifecycle_generation bigint,
  p_worker_lease_token text, p_succeeded boolean
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_now timestamptz := clock_timestamp();
BEGIN
  IF p_succeeded IS NULL THEN RETURN false; END IF;
  UPDATE public.account_purge_provider_operation_permits permit
  SET status = CASE WHEN permit.operation_deadline <= v_now THEN 'unresolved'
      WHEN p_succeeded THEN 'completed' ELSE 'failed' END,
    resolved_at = CASE WHEN permit.operation_deadline <= v_now THEN NULL ELSE v_now END,
    resolution = CASE WHEN permit.operation_deadline <= v_now THEN 'late_provider_response_requires_reconciliation'
      WHEN p_succeeded THEN 'provider_acknowledged_success' ELSE 'provider_acknowledged_failure' END,
    retention_expires_at = CASE WHEN permit.operation_deadline <= v_now THEN NULL
      ELSE v_now + interval '30 days' END,
    task_id = NULL, owner_id = NULL, worker_lease_token = NULL
  WHERE permit.id = p_permit_id AND permit.task_id = p_task_id
    AND permit.lifecycle_generation = p_lifecycle_generation
    AND permit.worker_lease_token = p_worker_lease_token AND permit.status = 'started';
  RETURN FOUND AND EXISTS (
    SELECT 1 FROM public.account_purge_provider_operation_permits permit
    WHERE permit.id = p_permit_id AND permit.status IN ('completed', 'failed'));
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.finish_account_purge_provider_operation(text, text, bigint, text, boolean)
  FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint

-- Pause first closes admission under the same row lock used by start. Existing
-- permits remain durable. Cleanup leases are fenced so a later approval cannot
-- reuse work claimed in an older control epoch.
CREATE FUNCTION public.begin_account_purge_provider_pause(
  p_expected_epoch bigint, p_reason text, p_actor text
) RETURNS text
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_now timestamptz := clock_timestamp(); v_epoch bigint;
BEGIN
  IF p_reason IS NULL OR char_length(p_reason) NOT BETWEEN 1 AND 200
    OR p_actor IS NULL OR char_length(p_actor) NOT BETWEEN 1 AND 200 THEN RETURN 'rejected'; END IF;
  UPDATE public.account_purge_operator_control
  SET paused = true, execute_until = NULL, generation = generation + 1,
    drain_state = 'draining', reason = p_reason, actor = p_actor, updated_at = v_now
  WHERE singleton AND generation = p_expected_epoch
  RETURNING generation INTO v_epoch;
  IF NOT FOUND THEN RETURN 'stale_epoch'; END IF;

  UPDATE public.account_purge_object_cleanup_tasks SET status = 'failed',
    next_attempt_at = v_now, lease_token = NULL, lease_expires_at = NULL,
    failure_category = 'operator_pause', updated_at = v_now WHERE status = 'deleting';
  UPDATE public.account_lifecycles SET state = 'purge_failed', next_attempt_at = v_now,
    lease_token = NULL, lease_expires_at = NULL, last_error_category = 'operator_pause',
    updated_at = v_now WHERE state = 'purging';
  RETURN 'draining';
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.begin_account_purge_provider_pause(bigint, text, text)
  FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint

-- This bounded database check never asserts external provider quiescence.
-- Expired operations are incidents because R2 may complete after cancellation,
-- and multipart aborts require provider-side reconciliation.
CREATE FUNCTION public.refresh_account_purge_provider_drain()
RETURNS text
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_now timestamptz := clock_timestamp(); v_started bigint; v_unresolved bigint; v_state text;
BEGIN
  PERFORM 1 FROM public.account_purge_operator_control WHERE singleton FOR UPDATE;
  IF NOT FOUND THEN RETURN 'missing_control'; END IF;
  UPDATE public.account_purge_provider_operation_permits
  SET status = 'unresolved', resolution = 'operation_deadline_expired_requires_provider_reconciliation',
    task_id = NULL, owner_id = NULL, worker_lease_token = NULL
  WHERE status = 'started' AND operation_deadline <= v_now;
  SELECT count(*) FILTER (WHERE status = 'started'), count(*) FILTER (WHERE status = 'unresolved')
    INTO v_started, v_unresolved FROM public.account_purge_provider_operation_permits;
  v_state := CASE WHEN v_unresolved > 0 THEN 'incident' WHEN v_started > 0 THEN 'draining' ELSE 'paused' END;
  UPDATE public.account_purge_operator_control SET drain_state = v_state, updated_at = v_now
    WHERE singleton AND paused AND drain_state IN ('draining', 'incident');
  RETURN v_state;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.refresh_account_purge_provider_drain() FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint

CREATE FUNCTION public.reconcile_account_purge_provider_operation(
  p_permit_id text, p_resolution text, p_actor text
) RETURNS boolean
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_now timestamptz := clock_timestamp();
BEGIN
  IF p_actor IS NULL OR char_length(p_actor) NOT BETWEEN 1 AND 200 THEN RETURN false; END IF;
  UPDATE public.account_purge_provider_operation_permits permit
  SET status = 'reconciled', resolved_at = v_now, resolution = p_resolution,
    reconciled_actor_digest = encode(sha256(convert_to(p_actor, 'UTF8')), 'hex'),
    retention_expires_at = v_now + interval '30 days'
  WHERE permit.id = p_permit_id AND permit.status = 'unresolved' AND (
    (permit.operation = 'abort_export_multipart' AND p_resolution = 'multipart_reconciled') OR
    (permit.operation = 'delete_object' AND p_resolution IN
      ('provider_confirmed_completed', 'provider_confirmed_absent', 'provider_confirmed_not_started')) OR
    (permit.operation = 'verify_object_absent' AND p_resolution IN
      ('provider_confirmed_absent', 'provider_confirmed_not_started'))
  );
  RETURN FOUND;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.reconcile_account_purge_provider_operation(text, text, text)
  FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint

CREATE FUNCTION public.resume_account_purge_provider_operations(
  p_expected_epoch bigint, p_execute_until timestamptz, p_reason text, p_actor text
) RETURNS boolean
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_now timestamptz := clock_timestamp();
BEGIN
  IF p_execute_until IS NULL OR p_execute_until <= v_now
    OR p_execute_until > v_now + interval '15 minutes'
    OR p_reason IS NULL OR char_length(p_reason) NOT BETWEEN 1 AND 200
    OR p_actor IS NULL OR char_length(p_actor) NOT BETWEEN 1 AND 200 THEN RETURN false; END IF;
  UPDATE public.account_purge_operator_control control
  SET paused = false, execute_until = p_execute_until, generation = generation + 1,
    drain_state = 'active', reason = p_reason, actor = p_actor, updated_at = v_now
  WHERE singleton AND generation = p_expected_epoch
    AND ((paused AND drain_state = 'paused') OR (NOT paused AND drain_state = 'active'))
    AND NOT EXISTS (SELECT 1 FROM public.account_purge_provider_operation_permits
      WHERE status IN ('started', 'unresolved'));
  IF NOT FOUND THEN RETURN false; END IF;
  -- Renewal is a new epoch too. Never carry old worker leases into it.
  UPDATE public.account_purge_object_cleanup_tasks SET status = 'failed',
    next_attempt_at = 'infinity'::timestamptz, lease_token = NULL, lease_expires_at = NULL,
    failure_category = 'operator_epoch_changed', updated_at = v_now WHERE status = 'deleting';
  UPDATE public.account_lifecycles SET state = 'purge_failed', next_attempt_at = 'infinity'::timestamptz,
    lease_token = NULL, lease_expires_at = NULL, last_error_category = 'operator_epoch_changed',
    updated_at = v_now WHERE state = 'purging';
  RETURN true;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.resume_account_purge_provider_operations(bigint, timestamptz, text, text)
  FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint

-- Preserve the owner workflow API while applying the stricter state machine.
CREATE OR REPLACE FUNCTION public.set_account_purge_operator_pause(
  p_paused boolean, p_execute_until timestamptz, p_reason text, p_actor text
) RETURNS boolean
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_epoch bigint; v_result text;
BEGIN
  SELECT generation INTO v_epoch FROM public.account_purge_operator_control WHERE singleton;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_paused THEN
    IF p_execute_until IS NOT NULL THEN RETURN false; END IF;
    v_result := public.begin_account_purge_provider_pause(v_epoch, p_reason, p_actor);
    IF v_result <> 'draining' THEN RETURN false; END IF;
    PERFORM public.refresh_account_purge_provider_drain();
    RETURN true;
  END IF;
  RETURN public.resume_account_purge_provider_operations(v_epoch, p_execute_until, p_reason, p_actor);
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.set_account_purge_operator_pause(boolean, timestamptz, text, text)
  FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint

-- Require active state as well as the original bounded window for claims and
-- provisional authorizations. These remain owner-only and are not permits.
CREATE OR REPLACE FUNCTION public.claim_account_purge_cleanup(p_limit integer, p_lease_token text, p_lease_seconds integer)
RETURNS TABLE(task_id text, owner_id text, lifecycle_generation bigint, object_key text,
  export_cleanup_task_id text, export_upload_id text, lease_token text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_control public.account_purge_operator_control%ROWTYPE;
BEGIN
  SELECT control.* INTO v_control FROM public.account_purge_operator_control control
    WHERE control.singleton FOR SHARE;
  IF NOT FOUND OR v_control.paused OR v_control.drain_state <> 'active'
    OR v_control.execute_until IS NULL OR v_control.execute_until <= clock_timestamp()
    OR v_control.updated_at + interval '15 minutes' <= clock_timestamp() THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM public.claim_account_purge_cleanup_without_operator_gate(
    p_limit, p_lease_token, p_lease_seconds);
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.claim_account_purge_cleanup(integer, text, integer) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.authorize_account_purge_cleanup(
  p_task_id text, p_generation bigint, p_lease_token text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_control public.account_purge_operator_control%ROWTYPE;
BEGIN
  SELECT control.* INTO v_control FROM public.account_purge_operator_control control
    WHERE control.singleton FOR SHARE;
  IF NOT FOUND OR v_control.paused OR v_control.drain_state <> 'active'
    OR v_control.execute_until IS NULL OR v_control.execute_until <= clock_timestamp()
    OR v_control.updated_at + interval '15 minutes' <= clock_timestamp() THEN RETURN false; END IF;
  RETURN EXISTS (SELECT 1 FROM public.account_purge_object_cleanup_tasks task
    JOIN public.account_lifecycles lifecycle ON lifecycle.user_id = task.user_id
    WHERE task.id = p_task_id AND task.status = 'deleting'
      AND task.lease_token = p_lease_token AND task.lease_expires_at > clock_timestamp()
      AND lifecycle.generation = p_generation AND lifecycle.state = 'purging'
      AND lifecycle.lease_token = p_lease_token AND lifecycle.lease_expires_at > clock_timestamp());
END;
$$;--> statement-breakpoint

DROP FUNCTION public.report_account_purge_operator_control();--> statement-breakpoint
CREATE FUNCTION public.report_account_purge_operator_control()
RETURNS TABLE(paused boolean, control_present boolean, control_fresh boolean,
  terminal_cleanup_count bigint, drain_state text, operator_epoch bigint,
  started_operation_count bigint, unresolved_operation_count bigint,
  safe_to_resume boolean, external_provider_quiescence_claimed boolean,
  drain_updated_at timestamptz, oldest_started_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT coalesce(bool_and(control.paused), true), count(*) = 1,
    coalesce(bool_and(NOT control.paused AND control.drain_state = 'active'
      AND control.execute_until > clock_timestamp()
      AND control.updated_at + interval '15 minutes' > clock_timestamp()), false),
    (SELECT count(*) FROM public.account_purge_object_cleanup_tasks task
      WHERE task.status = 'failed' AND task.next_attempt_at = 'infinity'::timestamptz),
    coalesce(max(control.drain_state), 'incident'), coalesce(max(control.generation), 0),
    (SELECT count(*) FROM public.account_purge_provider_operation_permits WHERE status = 'started'),
    (SELECT count(*) FROM public.account_purge_provider_operation_permits WHERE status = 'unresolved'),
    coalesce(bool_and(control.paused AND control.drain_state = 'paused'), false)
      AND NOT EXISTS (SELECT 1 FROM public.account_purge_provider_operation_permits
        WHERE status IN ('started', 'unresolved')),
    false, max(control.updated_at),
    (SELECT min(started_at) FROM public.account_purge_provider_operation_permits WHERE status = 'started')
  FROM public.account_purge_operator_control control WHERE control.singleton;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.report_account_purge_operator_control() FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.report_account_purge_operator_control() TO lifecycle_worker;--> statement-breakpoint

-- Closed permit evidence contains only digests and bounded operational state.
-- Unresolved incidents are never age-deleted. Owner review must reconcile them.
CREATE FUNCTION public.delete_expired_account_purge_provider_permits(p_limit integer)
RETURNS integer
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_deleted integer;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RETURN 0; END IF;
  WITH expired AS (
    SELECT id FROM public.account_purge_provider_operation_permits
    WHERE status IN ('completed', 'failed', 'reconciled')
      AND retention_expires_at <= clock_timestamp()
    ORDER BY retention_expires_at, id FOR UPDATE SKIP LOCKED LIMIT p_limit
  )
  DELETE FROM public.account_purge_provider_operation_permits permit
  USING expired WHERE permit.id = expired.id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.delete_expired_account_purge_provider_permits(integer)
  FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint

-- Explicitly retain report-only runtime posture.
REVOKE ALL ON FUNCTION public.start_account_purge_provider_operation(text, text, bigint, text, text, timestamptz) FROM app, lifecycle_worker;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.finish_account_purge_provider_operation(text, text, bigint, text, boolean) FROM app, lifecycle_worker;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.begin_account_purge_provider_pause(bigint, text, text) FROM app, lifecycle_worker;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.refresh_account_purge_provider_drain() FROM app, lifecycle_worker;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.reconcile_account_purge_provider_operation(text, text, text) FROM app, lifecycle_worker;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.resume_account_purge_provider_operations(bigint, timestamptz, text, text) FROM app, lifecycle_worker;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.delete_expired_account_purge_provider_permits(integer) FROM app, lifecycle_worker;