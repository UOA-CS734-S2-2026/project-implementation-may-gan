-- squawk-ignore-file prefer-robust-stmts
-- squawk-ignore-file prefer-bigint-over-int
-- squawk-ignore-file constraint-missing-not-valid
-- squawk-ignore-file adding-foreign-key-constraint
-- squawk-ignore-file require-concurrent-index-creation
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
CREATE TYPE "public"."account_realtime_revocation_status" AS ENUM('pending', 'leased', 'completed', 'superseded', 'failed');--> statement-breakpoint
CREATE TABLE "account_realtime_revocations" (
	"user_id" text NOT NULL,
	"lifecycle_generation" bigint NOT NULL,
	"status" "account_realtime_revocation_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"lease_token" text,
	"lease_expires_at" timestamp with time zone,
	"failure_category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"retention_expires_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_realtime_revocations_user_generation_unique" UNIQUE("user_id","lifecycle_generation"),
	CONSTRAINT "account_realtime_revocations_generation_check" CHECK ("account_realtime_revocations"."lifecycle_generation" between 1 and 9007199254740991),
	CONSTRAINT "account_realtime_revocations_attempt_check" CHECK ("account_realtime_revocations"."attempt_count" >= 0),
	CONSTRAINT "account_realtime_revocations_lease_pair_check" CHECK (("account_realtime_revocations"."lease_token" is null) = ("account_realtime_revocations"."lease_expires_at" is null)),
	CONSTRAINT "account_realtime_revocations_state_check" CHECK (
    ("account_realtime_revocations"."status" = 'pending' and "account_realtime_revocations"."next_attempt_at" is not null and "account_realtime_revocations"."lease_token" is null and "account_realtime_revocations"."completed_at" is null and "account_realtime_revocations"."retention_expires_at" is null) or
    ("account_realtime_revocations"."status" = 'leased' and "account_realtime_revocations"."next_attempt_at" is null and "account_realtime_revocations"."lease_token" is not null and "account_realtime_revocations"."completed_at" is null and "account_realtime_revocations"."retention_expires_at" is null) or
    ("account_realtime_revocations"."status" in ('completed', 'superseded', 'failed') and "account_realtime_revocations"."next_attempt_at" is null and "account_realtime_revocations"."lease_token" is null and "account_realtime_revocations"."completed_at" is not null and "account_realtime_revocations"."retention_expires_at" = "account_realtime_revocations"."completed_at" + interval '720 hours')
  )
);
--> statement-breakpoint
ALTER TABLE "account_realtime_revocations" ADD CONSTRAINT "account_realtime_revocations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_realtime_revocations_due_idx" ON "account_realtime_revocations" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "account_realtime_revocations_lease_idx" ON "account_realtime_revocations" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE INDEX "account_realtime_revocations_retention_idx" ON "account_realtime_revocations" USING btree ("status","retention_expires_at");--> statement-breakpoint

CREATE FUNCTION public.enqueue_account_realtime_revocation(p_user_id text, p_generation bigint)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.account_lifecycles lifecycle
    WHERE lifecycle.user_id = p_user_id AND lifecycle.generation = p_generation
      AND lifecycle.state <> 'active') THEN RETURN false; END IF;
  INSERT INTO public.account_realtime_revocations
    (user_id, lifecycle_generation, status, next_attempt_at)
    VALUES (p_user_id, p_generation, 'pending', clock_timestamp())
    ON CONFLICT ON CONSTRAINT account_realtime_revocations_user_generation_unique DO NOTHING;
  RETURN true;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.enqueue_account_realtime_revocation(text, bigint) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.enqueue_account_realtime_revocation(text, bigint) TO app;--> statement-breakpoint

CREATE FUNCTION public.claim_account_realtime_revocations(p_limit integer, p_lease_token text, p_lease_seconds integer)
RETURNS TABLE(owner_id text, lifecycle_generation bigint, attempt_count bigint, lease_token text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE candidate public.account_realtime_revocations%ROWTYPE; claimed integer := 0; v_now timestamptz;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 25 OR p_lease_token IS NULL
    OR char_length(p_lease_token) NOT BETWEEN 1 AND 200 OR p_lease_seconds IS NULL
    OR p_lease_seconds NOT BETWEEN 15 AND 300 THEN RETURN; END IF;
  v_now := clock_timestamp();
  FOR candidate IN SELECT revocation.* FROM public.account_realtime_revocations revocation
    WHERE (revocation.status = 'pending' AND revocation.next_attempt_at <= v_now)
      OR (revocation.status = 'leased' AND revocation.lease_expires_at <= v_now)
    ORDER BY coalesce(revocation.next_attempt_at, revocation.lease_expires_at), revocation.created_at
    LIMIT p_limit * 4 FOR UPDATE SKIP LOCKED
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.account_lifecycles lifecycle
      WHERE lifecycle.user_id = candidate.user_id AND lifecycle.generation = candidate.lifecycle_generation
        AND lifecycle.state <> 'active') THEN
      UPDATE public.account_realtime_revocations revocation SET status = 'superseded', next_attempt_at = NULL,
        lease_token = NULL, lease_expires_at = NULL, failure_category = NULL,
        completed_at = v_now, retention_expires_at = v_now + interval '720 hours', updated_at = v_now
        WHERE revocation.user_id = candidate.user_id AND revocation.lifecycle_generation = candidate.lifecycle_generation;
      CONTINUE;
    END IF;
    UPDATE public.account_realtime_revocations revocation SET status = 'leased', attempt_count = revocation.attempt_count + 1,
      next_attempt_at = NULL, lease_token = p_lease_token,
      lease_expires_at = v_now + make_interval(secs => p_lease_seconds), failure_category = NULL, updated_at = v_now
      WHERE revocation.user_id = candidate.user_id AND revocation.lifecycle_generation = candidate.lifecycle_generation;
    owner_id := candidate.user_id; lifecycle_generation := candidate.lifecycle_generation;
    attempt_count := candidate.attempt_count + 1; lease_token := p_lease_token;
    RETURN NEXT; claimed := claimed + 1;
    IF claimed >= p_limit THEN RETURN; END IF;
  END LOOP;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.claim_account_realtime_revocations(integer, text, integer) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.claim_account_realtime_revocations(integer, text, integer) TO lifecycle_worker;--> statement-breakpoint

CREATE FUNCTION public.complete_account_realtime_revocation(p_user_id text, p_generation bigint, p_lease_token text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_status public.account_realtime_revocation_status; v_now timestamptz;
BEGIN
  v_now := clock_timestamp();
  SELECT CASE WHEN EXISTS (SELECT 1 FROM public.account_lifecycles lifecycle
      WHERE lifecycle.user_id = p_user_id AND lifecycle.generation = p_generation
        AND lifecycle.state <> 'active') THEN 'completed'::public.account_realtime_revocation_status
    ELSE 'superseded'::public.account_realtime_revocation_status END INTO v_status;
  UPDATE public.account_realtime_revocations SET status = v_status, next_attempt_at = NULL,
    lease_token = NULL, lease_expires_at = NULL, failure_category = NULL,
    completed_at = v_now, retention_expires_at = v_now + interval '720 hours', updated_at = v_now
    WHERE user_id = p_user_id AND lifecycle_generation = p_generation AND status = 'leased'
      AND lease_token = p_lease_token AND lease_expires_at > v_now;
  RETURN FOUND;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.complete_account_realtime_revocation(text, bigint, text) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.complete_account_realtime_revocation(text, bigint, text) TO lifecycle_worker;--> statement-breakpoint

CREATE FUNCTION public.retry_account_realtime_revocation(p_user_id text, p_generation bigint, p_lease_token text, p_delay_seconds integer, p_terminal boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_now timestamptz;
BEGIN
  IF p_delay_seconds IS NULL OR p_delay_seconds NOT BETWEEN 1 AND 3600 OR p_terminal IS NULL THEN RETURN false; END IF;
  v_now := clock_timestamp();
  UPDATE public.account_realtime_revocations SET status = CASE WHEN p_terminal THEN 'failed'::public.account_realtime_revocation_status
      ELSE 'pending'::public.account_realtime_revocation_status END,
    next_attempt_at = CASE WHEN p_terminal THEN NULL ELSE v_now + make_interval(secs => p_delay_seconds) END,
    lease_token = NULL, lease_expires_at = NULL, failure_category = 'rpc',
    completed_at = CASE WHEN p_terminal THEN v_now ELSE NULL END,
    retention_expires_at = CASE WHEN p_terminal THEN v_now + interval '720 hours' ELSE NULL END, updated_at = v_now
    WHERE user_id = p_user_id AND lifecycle_generation = p_generation AND status = 'leased'
      AND lease_token = p_lease_token AND lease_expires_at > v_now;
  RETURN FOUND;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.retry_account_realtime_revocation(text, bigint, text, integer, boolean) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.retry_account_realtime_revocation(text, bigint, text, integer, boolean) TO lifecycle_worker;--> statement-breakpoint

CREATE FUNCTION public.prune_account_realtime_revocations(p_limit integer)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_deleted integer;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN RETURN 0; END IF;
  DELETE FROM public.account_realtime_revocations revocation WHERE (revocation.user_id, revocation.lifecycle_generation) IN (
    SELECT due.user_id, due.lifecycle_generation FROM public.account_realtime_revocations due
      WHERE due.status IN ('completed', 'superseded', 'failed') AND due.retention_expires_at <= clock_timestamp()
      ORDER BY due.retention_expires_at, due.user_id, due.lifecycle_generation LIMIT p_limit FOR UPDATE SKIP LOCKED);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.prune_account_realtime_revocations(integer) FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.prune_account_realtime_revocations(integer) TO lifecycle_worker;--> statement-breakpoint

CREATE FUNCTION public.report_account_realtime_revocations()
RETURNS TABLE(due_count bigint, leased_count bigint, oldest_pending_seconds bigint, completed_count bigint, superseded_count bigint, failed_count bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT count(*) FILTER (WHERE (status = 'pending' AND next_attempt_at <= clock_timestamp())
      OR (status = 'leased' AND lease_expires_at <= clock_timestamp())),
    count(*) FILTER (WHERE status = 'leased' AND lease_expires_at > clock_timestamp()),
    coalesce(extract(epoch FROM clock_timestamp() - min(created_at) FILTER (WHERE status IN ('pending', 'leased')))::bigint, 0),
    count(*) FILTER (WHERE status = 'completed'), count(*) FILTER (WHERE status = 'superseded'),
    count(*) FILTER (WHERE status = 'failed')
  FROM public.account_realtime_revocations;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.report_account_realtime_revocations() FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.report_account_realtime_revocations() TO lifecycle_worker;--> statement-breakpoint
REVOKE ALL ON TABLE public.account_realtime_revocations FROM PUBLIC, app, lifecycle_worker;