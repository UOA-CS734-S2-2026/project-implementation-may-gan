-- This regular index runs in the transactional migration runner. It may briefly
-- block message writes, so apply it before enabling the quota and within the
-- bounded lock and statement timeouts below.
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
-- squawk-ignore-file require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS "messages_sender_created_at_idx" ON "messages" USING btree ("sender_id","created_at");
