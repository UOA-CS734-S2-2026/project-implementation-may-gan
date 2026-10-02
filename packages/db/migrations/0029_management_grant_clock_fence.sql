-- Replace the #245 Google-aware consumer without weakening its provider fencing.
-- Transaction-stable now() would accept a proof that expired while a row lock waited.
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
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
  WHERE id = p_session_id AND user_id = p_user_id AND expires_at > clock_timestamp() FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT state, generation, cancel_until INTO lifecycle_state, current_generation, cancellation_deadline
  FROM public.account_lifecycles WHERE user_id = p_user_id FOR SHARE;
  lifecycle_state := coalesce(lifecycle_state, 'active');
  current_generation := coalesce(current_generation, 0);
  IF (p_action = 'request_deletion' AND lifecycle_state <> 'active')
    OR (p_action = 'cancel_deletion' AND (lifecycle_state <> 'pending_deletion' OR clock_timestamp() >= cancellation_deadline)) THEN
    RETURN false;
  END IF;
  SELECT credential_hash_digest, google_subject_digest INTO grant_credential_digest, grant_google_digest
  FROM public.account_management_grants
  WHERE token_digest = p_token_digest AND user_id = p_user_id AND session_id = p_session_id
    AND action = p_action AND lifecycle_generation = current_generation
    AND consumed_at IS NULL AND expires_at > clock_timestamp() FOR UPDATE;
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
  UPDATE public.account_management_grants SET consumed_at = clock_timestamp()
  WHERE token_digest = p_token_digest AND consumed_at IS NULL AND expires_at > clock_timestamp()
    AND EXISTS (
      SELECT 1 FROM public.session
      WHERE id = p_session_id AND user_id = p_user_id AND expires_at > clock_timestamp()
    )
    AND (p_action <> 'cancel_deletion' OR EXISTS (
      SELECT 1 FROM public.account_lifecycles
      WHERE user_id = p_user_id AND state = 'pending_deletion' AND cancel_until > clock_timestamp()
    ))
  RETURNING token_digest INTO consumed_digest;
  RETURN consumed_digest IS NOT NULL;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.consume_account_management_grant(text, text, public.account_management_grant_action, text)
FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.consume_account_management_grant(text, text, public.account_management_grant_action, text)
TO app;
