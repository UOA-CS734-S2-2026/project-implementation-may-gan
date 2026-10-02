-- A password grant is issued only after the API verifies Better Auth's hash.
-- The procedure fences a changed credential, live session, action, and lifecycle
-- generation. Neither runtime role can write grant rows directly.
-- squawk-ignore-file prefer-robust-stmts
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
ALTER TABLE "account_management_grants" ADD COLUMN "lifecycle_generation" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "account_management_grants" ADD CONSTRAINT "account_management_grants_generation_check" CHECK ("account_management_grants"."lifecycle_generation" between 0 and 9007199254740991);--> statement-breakpoint
CREATE FUNCTION public.issue_password_account_management_grant(
  p_user_id text,
  p_session_id text,
  p_action public.account_management_grant_action,
  p_token_digest text,
  p_password_hash_observed text
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  session_owner text;
  stored_password text;
  lifecycle_state public.account_lifecycle_state;
  current_generation bigint;
  cancellation_deadline timestamptz;
  issued_expiry timestamptz;
BEGIN
  IF p_user_id IS NULL OR p_session_id IS NULL OR p_action IS NULL
    OR p_token_digest IS NULL OR p_token_digest !~ '^[0-9a-f]{64}$' OR p_password_hash_observed IS NULL THEN
    RETURN NULL;
  END IF;

  -- #161 lifecycle commands must take this same user lock before creating or
  -- changing the lifecycle row. It also closes the missing-row race here.
  PERFORM 1 FROM public."user" WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT user_id INTO session_owner FROM public.session
  WHERE id = p_session_id AND expires_at > now() FOR SHARE;
  IF session_owner IS DISTINCT FROM p_user_id THEN RETURN NULL; END IF;
  SELECT password INTO stored_password FROM public.account
  WHERE user_id = p_user_id AND provider_id = 'credential' AND password IS NOT NULL
  FOR SHARE;
  IF stored_password IS DISTINCT FROM p_password_hash_observed THEN RETURN NULL; END IF;

  SELECT state, generation, cancel_until INTO lifecycle_state, current_generation, cancellation_deadline
  FROM public.account_lifecycles WHERE user_id = p_user_id FOR SHARE;
  lifecycle_state := coalesce(lifecycle_state, 'active');
  current_generation := coalesce(current_generation, 0);
  IF (p_action = 'request_deletion' AND lifecycle_state <> 'active')
    OR (p_action = 'cancel_deletion' AND (lifecycle_state <> 'pending_deletion' OR now() >= cancellation_deadline)) THEN
    RETURN NULL;
  END IF;

  issued_expiry := now() + interval '5 minutes';
  INSERT INTO public.account_management_grants
    (token_digest, user_id, session_id, action, lifecycle_generation, expires_at)
  VALUES (p_token_digest, p_user_id, p_session_id, p_action, current_generation, issued_expiry);
  RETURN issued_expiry;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.issue_password_account_management_grant(text, text, public.account_management_grant_action, text, text)
FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.issue_password_account_management_grant(text, text, public.account_management_grant_action, text, text)
TO app;--> statement-breakpoint
CREATE FUNCTION public.consume_account_management_grant(
  p_user_id text,
  p_session_id text,
  p_action public.account_management_grant_action,
  p_token_digest text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_generation bigint;
  lifecycle_state public.account_lifecycle_state;
  cancellation_deadline timestamptz;
  consumed_digest text;
BEGIN
  IF p_user_id IS NULL OR p_session_id IS NULL OR p_action IS NULL
    OR p_token_digest IS NULL OR p_token_digest !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;
  PERFORM 1 FROM public."user" WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public.session WHERE id = p_session_id AND user_id = p_user_id AND expires_at > now() FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT state, generation, cancel_until INTO lifecycle_state, current_generation, cancellation_deadline
  FROM public.account_lifecycles WHERE user_id = p_user_id FOR SHARE;
  lifecycle_state := coalesce(lifecycle_state, 'active');
  current_generation := coalesce(current_generation, 0);
  IF (p_action = 'request_deletion' AND lifecycle_state <> 'active')
    OR (p_action = 'cancel_deletion' AND (lifecycle_state <> 'pending_deletion' OR now() >= cancellation_deadline)) THEN
    RETURN false;
  END IF;
  UPDATE public.account_management_grants
  SET consumed_at = now()
  WHERE token_digest = p_token_digest AND user_id = p_user_id AND session_id = p_session_id
    AND action = p_action AND lifecycle_generation = current_generation
    AND consumed_at IS NULL AND expires_at > now()
  RETURNING token_digest INTO consumed_digest;
  RETURN consumed_digest IS NOT NULL;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.consume_account_management_grant(text, text, public.account_management_grant_action, text)
FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.consume_account_management_grant(text, text, public.account_management_grant_action, text)
TO app;