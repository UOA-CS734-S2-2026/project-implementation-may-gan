-- The preceding proof state migration is immutable. This additive migration
-- invalidates every pre-token claimed row instead of guessing callback ownership.
-- squawk-ignore-file require-lock-timeout
-- squawk-ignore-file require-statement-timeout
-- squawk-ignore-file prefer-robust-stmts
-- squawk-ignore-file ban-drop-not-null
-- squawk-ignore-file constraint-missing-not-valid
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
ALTER TABLE "account_google_reauthentication_intents" ALTER COLUMN "verifier_ciphertext" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "account_google_reauthentication_intents" ALTER COLUMN "verifier_key_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "account_google_reauthentication_intents" ADD COLUMN "callback_claim_digest" text;--> statement-breakpoint
ALTER TABLE "account_management_grants" ADD COLUMN "lifecycle_generation" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "account_google_reauthentication_intents" DROP CONSTRAINT "account_google_reauth_intents_state_check";--> statement-breakpoint
UPDATE "account_google_reauthentication_intents"
SET status = 'failed', failed_at = coalesce(failed_at, now()), consumed_at = null,
    verifier_ciphertext = null, verifier_key_version = null,
    callback_claimed_at = null, callback_lease_expires_at = null,
    callback_claim_digest = null, proof_subject_digest = null,
    proof_subject_key_version = null, proofed_at = null
WHERE status = 'claimed';--> statement-breakpoint
-- 0018 permitted these terminal rows to retain callback lease metadata. Keep
-- their valid proof evidence and consumed receipt, but remove that obsolete
-- in-flight callback material before validating the stricter terminal states.
UPDATE "account_google_reauthentication_intents"
SET callback_claimed_at = null, callback_lease_expires_at = null,
    callback_claim_digest = null
WHERE status IN ('proofed', 'consumed');--> statement-breakpoint
ALTER TABLE "account_google_reauthentication_intents"
  ADD CONSTRAINT "account_google_reauth_intents_claim_digest_check" CHECK ("account_google_reauthentication_intents"."callback_claim_digest" is null or "account_google_reauthentication_intents"."callback_claim_digest" ~ '^[0-9a-f]{64}$') NOT VALID,
  ADD CONSTRAINT "account_google_reauth_intents_state_check" CHECK (
    (status = 'pending' AND verifier_ciphertext IS NOT NULL AND verifier_key_version IS NOT NULL AND callback_claimed_at IS NULL AND callback_lease_expires_at IS NULL AND callback_claim_digest IS NULL AND proof_subject_digest IS NULL AND proof_subject_key_version IS NULL AND proofed_at IS NULL AND failed_at IS NULL AND consumed_at IS NULL) OR
    (status = 'claimed' AND verifier_ciphertext IS NOT NULL AND verifier_key_version IS NOT NULL AND callback_claimed_at IS NOT NULL AND callback_lease_expires_at IS NOT NULL AND callback_lease_expires_at > callback_claimed_at AND callback_lease_expires_at <= expires_at AND callback_claim_digest IS NOT NULL AND proof_subject_digest IS NULL AND proof_subject_key_version IS NULL AND proofed_at IS NULL AND failed_at IS NULL AND consumed_at IS NULL) OR
    (status = 'proofed' AND verifier_ciphertext IS NULL AND verifier_key_version IS NULL AND callback_claimed_at IS NULL AND callback_lease_expires_at IS NULL AND callback_claim_digest IS NULL AND proof_subject_digest IS NOT NULL AND proof_subject_key_version IS NOT NULL AND proofed_at IS NOT NULL AND proofed_at <= expires_at AND failed_at IS NULL AND consumed_at IS NULL) OR
    (status = 'consumed' AND verifier_ciphertext IS NULL AND verifier_key_version IS NULL AND callback_claimed_at IS NULL AND callback_lease_expires_at IS NULL AND callback_claim_digest IS NULL AND proof_subject_digest IS NOT NULL AND proof_subject_key_version IS NOT NULL AND proofed_at IS NOT NULL AND failed_at IS NULL AND consumed_at IS NOT NULL) OR
    (status = 'failed' AND verifier_ciphertext IS NULL AND verifier_key_version IS NULL AND callback_claimed_at IS NULL AND callback_lease_expires_at IS NULL AND callback_claim_digest IS NULL AND proof_subject_digest IS NULL AND proof_subject_key_version IS NULL AND proofed_at IS NULL AND failed_at IS NOT NULL AND consumed_at IS NULL)
  ) NOT VALID;--> statement-breakpoint
ALTER TABLE "account_management_grants" ADD CONSTRAINT "account_management_grants_generation_check" CHECK ("account_management_grants"."lifecycle_generation" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "account_google_reauthentication_intents" VALIDATE CONSTRAINT "account_google_reauth_intents_claim_digest_check";--> statement-breakpoint
ALTER TABLE "account_google_reauthentication_intents" VALIDATE CONSTRAINT "account_google_reauth_intents_state_check";--> statement-breakpoint
ALTER TABLE "account_management_grants" VALIDATE CONSTRAINT "account_management_grants_generation_check";