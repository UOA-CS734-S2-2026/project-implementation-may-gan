-- 0018 is unpublished and follows the unpublished 0017 intent table. Existing
-- 0017 rows cannot prove PKCE possession, so they are made terminally failed.
-- squawk-ignore-file require-lock-timeout
-- squawk-ignore-file require-statement-timeout
-- squawk-ignore-file prefer-robust-stmts
-- squawk-ignore-file constraint-missing-not-valid
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
ALTER TABLE public.account_google_reauthentication_intents
  ADD COLUMN verifier_ciphertext text,
  ADD COLUMN verifier_key_version text,
  ADD COLUMN status text NOT NULL DEFAULT 'pending',
  ADD COLUMN callback_claimed_at timestamp with time zone,
  ADD COLUMN callback_lease_expires_at timestamp with time zone,
  ADD COLUMN proof_subject_digest text,
  ADD COLUMN proof_subject_key_version text,
  ADD COLUMN proofed_at timestamp with time zone,
  ADD COLUMN failed_at timestamp with time zone;--> statement-breakpoint
UPDATE public.account_google_reauthentication_intents
SET status = 'failed', failed_at = now(), consumed_at = null
WHERE verifier_ciphertext IS NULL;--> statement-breakpoint
ALTER TABLE public.account_google_reauthentication_intents
  ADD CONSTRAINT account_google_reauth_intents_status_check CHECK (status IN ('pending', 'claimed', 'proofed', 'consumed', 'failed')),
  ADD CONSTRAINT account_google_reauth_intents_proof_digest_check CHECK (proof_subject_digest IS NULL OR proof_subject_digest ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT account_google_reauth_intents_state_check CHECK (
    (status = 'pending' AND verifier_ciphertext IS NOT NULL AND verifier_key_version IS NOT NULL AND callback_claimed_at IS NULL AND callback_lease_expires_at IS NULL AND proof_subject_digest IS NULL AND proof_subject_key_version IS NULL AND proofed_at IS NULL AND failed_at IS NULL AND consumed_at IS NULL) OR
    (status = 'claimed' AND verifier_ciphertext IS NOT NULL AND verifier_key_version IS NOT NULL AND callback_claimed_at IS NOT NULL AND callback_lease_expires_at IS NOT NULL AND callback_lease_expires_at > callback_claimed_at AND callback_lease_expires_at <= expires_at AND proof_subject_digest IS NULL AND proof_subject_key_version IS NULL AND proofed_at IS NULL AND failed_at IS NULL AND consumed_at IS NULL) OR
    (status = 'proofed' AND verifier_ciphertext IS NULL AND verifier_key_version IS NULL AND callback_claimed_at IS NOT NULL AND proof_subject_digest IS NOT NULL AND proof_subject_key_version IS NOT NULL AND proofed_at IS NOT NULL AND proofed_at <= expires_at AND failed_at IS NULL AND consumed_at IS NULL) OR
    (status = 'consumed' AND verifier_ciphertext IS NULL AND verifier_key_version IS NULL AND proof_subject_digest IS NOT NULL AND proof_subject_key_version IS NOT NULL AND proofed_at IS NOT NULL AND consumed_at IS NOT NULL AND failed_at IS NULL) OR
    (status = 'failed' AND verifier_ciphertext IS NULL AND verifier_key_version IS NULL AND proof_subject_digest IS NULL AND proof_subject_key_version IS NULL AND proofed_at IS NULL AND failed_at IS NOT NULL AND consumed_at IS NULL)
  );
