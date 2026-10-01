-- Existing values already satisfy the replacement check. The short timeouts make
-- this metadata-only constraint update fail safely during busy production traffic.
SET lock_timeout = '1s';--> statement-breakpoint
SET statement_timeout = '5s';--> statement-breakpoint
ALTER TABLE public.message_reactions DROP CONSTRAINT IF EXISTS message_reactions_key_check;--> statement-breakpoint
ALTER TABLE public.message_reactions ADD CONSTRAINT message_reactions_key_check CHECK (reaction in ('like', 'love', 'laugh', 'surprised', 'sad', 'angry', 'thanks')) NOT VALID;--> statement-breakpoint
ALTER TABLE public.message_reactions VALIDATE CONSTRAINT message_reactions_key_check;
