-- Push tokens are provider credentials. New application writes use ciphertext only.
-- Existing plaintext rows require a separately approved, key-backed migration before
-- production push is enabled. This additive migration intentionally never embeds a key.
SET lock_timeout = '1s';--> statement-breakpoint
SET statement_timeout = '5s';--> statement-breakpoint
ALTER TABLE "push_devices" ADD COLUMN IF NOT EXISTS "token_ciphertext" text;--> statement-breakpoint
ALTER TABLE "push_devices" ADD COLUMN IF NOT EXISTS "token_key_version" text;--> statement-breakpoint
