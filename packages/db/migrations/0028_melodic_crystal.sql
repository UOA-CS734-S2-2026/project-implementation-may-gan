-- Google management proofs use the existing OAuth callback URI without using
-- Better Auth's login callback. Only the trusted app role can call these
-- procedures. The intent and grant tables remain inaccessible to runtime roles.
-- squawk-ignore-file prefer-robust-stmts
-- squawk-ignore-file require-concurrent-index-creation
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.account_google_reauthentication_intents LIMIT 1) THEN
    RAISE EXCEPTION 'Google intent table is not empty. Review the concurrent index and migration plan.';
  END IF;
END;
$$;--> statement-breakpoint
ALTER TABLE "account_google_reauthentication_intents" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_management_grants" ADD COLUMN "google_subject_digest" text;--> statement-breakpoint
CREATE INDEX "account_google_reauth_intents_expiry_idx" ON "account_google_reauthentication_intents" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "account_management_grants" ADD CONSTRAINT "account_management_grants_google_digest_check" CHECK ("account_management_grants"."google_subject_digest" is null or "account_management_grants"."google_subject_digest" ~ '^[0-9a-f]{64}$') NOT VALID;--> statement-breakpoint
ALTER TABLE "account_management_grants" VALIDATE CONSTRAINT "account_management_grants_google_digest_check";--> statement-breakpoint
ALTER TABLE "account_management_grants" ADD CONSTRAINT "account_management_grants_single_proof_check" CHECK ("account_management_grants"."credential_hash_digest" is null or "account_management_grants"."google_subject_digest" is null) NOT VALID;--> statement-breakpoint
ALTER TABLE "account_management_grants" VALIDATE CONSTRAINT "account_management_grants_single_proof_check";--> statement-breakpoint
CREATE FUNCTION public.begin_google_account_management_intent(
  p_user_id text, p_session_id text, p_action public.account_management_grant_action,
  p_state_digest text, p_nonce_digest text
)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  session_owner text;
  lifecycle_state public.account_lifecycle_state;
  current_generation bigint;
  cancellation_deadline timestamptz;
  intent_expiry timestamptz;
BEGIN
  IF p_user_id IS NULL OR p_session_id IS NULL OR p_action IS NULL
    OR p_state_digest IS NULL OR p_state_digest !~ '^[0-9a-f]{64}$'
    OR p_nonce_digest IS NULL OR p_nonce_digest !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;
  PERFORM 1 FROM public."user" WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT user_id INTO session_owner FROM public.session
  WHERE id = p_session_id AND expires_at > now() FOR SHARE;
  IF session_owner IS DISTINCT FROM p_user_id THEN RETURN NULL; END IF;
  PERFORM 1 FROM public.account
  WHERE user_id = p_user_id AND provider_id = 'google' AND account_id IS NOT NULL FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT state, generation, cancel_until INTO lifecycle_state, current_generation, cancellation_deadline
  FROM public.account_lifecycles WHERE user_id = p_user_id FOR SHARE;
  lifecycle_state := coalesce(lifecycle_state, 'active');
  current_generation := coalesce(current_generation, 0);
  IF (p_action = 'request_deletion' AND lifecycle_state <> 'active')
    OR (p_action = 'cancel_deletion' AND (lifecycle_state <> 'pending_deletion' OR now() >= cancellation_deadline)) THEN
    RETURN NULL;
  END IF;
  intent_expiry := now() + interval '5 minutes';
  INSERT INTO public.account_google_reauthentication_intents
    (state_digest, nonce_digest, user_id, session_id, action, lifecycle_generation, expires_at)
  VALUES (p_state_digest, p_nonce_digest, p_user_id, p_session_id, p_action, current_generation, intent_expiry);
  RETURN intent_expiry;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.begin_google_account_management_intent(text, text, public.account_management_grant_action, text, text)
FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.begin_google_account_management_intent(text, text, public.account_management_grant_action, text, text) TO app;--> statement-breakpoint
CREATE FUNCTION public.claim_google_account_management_intent(
  p_state_digest text, p_user_id text, p_session_id text
)
RETURNS TABLE(proof_action public.account_management_grant_action, proof_nonce_digest text,
  proof_created_at timestamptz, proof_linked_subject text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  session_owner text;
  lifecycle_state public.account_lifecycle_state;
  current_generation bigint;
  cancellation_deadline timestamptz;
  intent_action public.account_management_grant_action;
  intent_generation bigint;
  intent_expiry timestamptz;
BEGIN
  IF p_state_digest IS NULL OR p_state_digest !~ '^[0-9a-f]{64}$'
    OR p_user_id IS NULL OR p_session_id IS NULL THEN RETURN; END IF;
  PERFORM 1 FROM public."user" WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT user_id INTO session_owner FROM public.session
  WHERE id = p_session_id AND expires_at > now() FOR SHARE;
  IF session_owner IS DISTINCT FROM p_user_id THEN RETURN; END IF;
  SELECT state, generation, cancel_until INTO lifecycle_state, current_generation, cancellation_deadline
  FROM public.account_lifecycles WHERE user_id = p_user_id FOR SHARE;
  lifecycle_state := coalesce(lifecycle_state, 'active');
  current_generation := coalesce(current_generation, 0);
  SELECT action, lifecycle_generation, expires_at, nonce_digest, created_at
  INTO intent_action, intent_generation, intent_expiry, proof_nonce_digest, proof_created_at
  FROM public.account_google_reauthentication_intents
  WHERE state_digest = p_state_digest AND user_id = p_user_id AND session_id = p_session_id
    AND claimed_at IS NULL AND expires_at > now() FOR UPDATE;
  IF NOT FOUND OR intent_generation IS DISTINCT FROM current_generation
    OR (intent_action = 'request_deletion' AND lifecycle_state <> 'active')
    OR (intent_action = 'cancel_deletion' AND (lifecycle_state <> 'pending_deletion' OR now() >= cancellation_deadline)) THEN
    RETURN;
  END IF;
  SELECT account_id INTO proof_linked_subject FROM public.account
  WHERE user_id = p_user_id AND provider_id = 'google' ORDER BY created_at, id LIMIT 1 FOR SHARE;
  IF proof_linked_subject IS NULL THEN RETURN; END IF;
  UPDATE public.account_google_reauthentication_intents SET claimed_at = now()
  WHERE state_digest = p_state_digest AND claimed_at IS NULL AND expires_at > now();
  IF NOT FOUND THEN RETURN; END IF;
  proof_action := intent_action;
  RETURN NEXT;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.claim_google_account_management_intent(text, text, text)
FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.claim_google_account_management_intent(text, text, text) TO app;--> statement-breakpoint
CREATE FUNCTION public.complete_google_account_management_intent(
  p_state_digest text, p_user_id text, p_session_id text,
  p_action public.account_management_grant_action, p_verified_subject text, p_token_digest text
)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  lifecycle_state public.account_lifecycle_state;
  current_generation bigint;
  cancellation_deadline timestamptz;
  intent_generation bigint;
  issued_expiry timestamptz;
BEGIN
  IF p_state_digest IS NULL OR p_state_digest !~ '^[0-9a-f]{64}$'
    OR p_token_digest IS NULL OR p_token_digest !~ '^[0-9a-f]{64}$'
    OR p_verified_subject IS NULL OR p_verified_subject = '' OR p_user_id IS NULL
    OR p_session_id IS NULL OR p_action IS NULL THEN RETURN NULL; END IF;
  PERFORM 1 FROM public."user" WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM 1 FROM public.session
  WHERE id = p_session_id AND user_id = p_user_id AND expires_at > now() FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT state, generation, cancel_until INTO lifecycle_state, current_generation, cancellation_deadline
  FROM public.account_lifecycles WHERE user_id = p_user_id FOR SHARE;
  lifecycle_state := coalesce(lifecycle_state, 'active');
  current_generation := coalesce(current_generation, 0);
  SELECT lifecycle_generation INTO intent_generation
  FROM public.account_google_reauthentication_intents
  WHERE state_digest = p_state_digest AND user_id = p_user_id AND session_id = p_session_id
    AND action = p_action AND claimed_at IS NOT NULL AND expires_at > now() FOR UPDATE;
  IF NOT FOUND OR intent_generation IS DISTINCT FROM current_generation
    OR (p_action = 'request_deletion' AND lifecycle_state <> 'active')
    OR (p_action = 'cancel_deletion' AND (lifecycle_state <> 'pending_deletion' OR now() >= cancellation_deadline)) THEN
    RETURN NULL;
  END IF;
  PERFORM 1 FROM public.account
  WHERE user_id = p_user_id AND provider_id = 'google' AND account_id = p_verified_subject FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  DELETE FROM public.account_google_reauthentication_intents WHERE state_digest = p_state_digest;
  issued_expiry := now() + interval '5 minutes';
  INSERT INTO public.account_management_grants
    (token_digest, user_id, session_id, action, lifecycle_generation, google_subject_digest, expires_at)
  VALUES (p_token_digest, p_user_id, p_session_id, p_action, current_generation,
    encode(sha256(convert_to(p_verified_subject, 'UTF8')), 'hex'), issued_expiry);
  RETURN issued_expiry;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.complete_google_account_management_intent(text, text, text, public.account_management_grant_action, text, text)
FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.complete_google_account_management_intent(text, text, text, public.account_management_grant_action, text, text) TO app;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.consume_account_management_grant(
  p_user_id text, p_session_id text, p_action public.account_management_grant_action, p_token_digest text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  current_generation bigint;
  lifecycle_state public.account_lifecycle_state;
  cancellation_deadline timestamptz;
  grant_credential_digest text;
  grant_google_digest text;
  stored_password text;
  linked_subject text;
  consumed_digest text;
BEGIN
  IF p_user_id IS NULL OR p_session_id IS NULL OR p_action IS NULL
    OR p_token_digest IS NULL OR p_token_digest !~ '^[0-9a-f]{64}$' THEN RETURN false; END IF;
  PERFORM 1 FROM public."user" WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public.session
  WHERE id = p_session_id AND user_id = p_user_id AND expires_at > now() FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT state, generation, cancel_until INTO lifecycle_state, current_generation, cancellation_deadline
  FROM public.account_lifecycles WHERE user_id = p_user_id FOR SHARE;
  lifecycle_state := coalesce(lifecycle_state, 'active');
  current_generation := coalesce(current_generation, 0);
  IF (p_action = 'request_deletion' AND lifecycle_state <> 'active')
    OR (p_action = 'cancel_deletion' AND (lifecycle_state <> 'pending_deletion' OR now() >= cancellation_deadline)) THEN
    RETURN false;
  END IF;
  SELECT credential_hash_digest, google_subject_digest INTO grant_credential_digest, grant_google_digest
  FROM public.account_management_grants
  WHERE token_digest = p_token_digest AND user_id = p_user_id AND session_id = p_session_id
    AND action = p_action AND lifecycle_generation = current_generation
    AND consumed_at IS NULL AND expires_at > now() FOR UPDATE;
  IF NOT FOUND OR (grant_credential_digest IS NULL AND grant_google_digest IS NULL) THEN RETURN false; END IF;
  IF grant_credential_digest IS NOT NULL THEN
    SELECT password INTO stored_password FROM public.account
    WHERE user_id = p_user_id AND provider_id = 'credential' AND password IS NOT NULL FOR SHARE;
    IF grant_credential_digest IS DISTINCT FROM encode(sha256(convert_to(stored_password, 'UTF8')), 'hex') THEN RETURN false; END IF;
  ELSE
    SELECT account_id INTO linked_subject FROM public.account
    WHERE user_id = p_user_id AND provider_id = 'google'
      AND encode(sha256(convert_to(account_id, 'UTF8')), 'hex') = grant_google_digest FOR SHARE;
    IF linked_subject IS NULL THEN RETURN false; END IF;
  END IF;
  UPDATE public.account_management_grants SET consumed_at = now()
  WHERE token_digest = p_token_digest AND consumed_at IS NULL AND expires_at > now()
  RETURNING token_digest INTO consumed_digest;
  RETURN consumed_digest IS NOT NULL;
END;
$$;--> statement-breakpoint
CREATE FUNCTION public.prune_expired_google_management_intents(p_limit integer DEFAULT 1000)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  removed integer;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN RETURN 0; END IF;
  WITH expired AS (
    SELECT state_digest FROM public.account_google_reauthentication_intents
    WHERE expires_at <= now() ORDER BY expires_at LIMIT p_limit FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.account_google_reauthentication_intents AS intents
  USING expired WHERE intents.state_digest = expired.state_digest;
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.prune_expired_google_management_intents(integer)
FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.prune_expired_google_management_intents(integer) TO app;
