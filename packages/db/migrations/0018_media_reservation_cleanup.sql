-- squawk-ignore-file prefer-robust-stmts
-- squawk-ignore-file require-lock-timeout
-- squawk-ignore-file require-statement-timeout
-- squawk-ignore-file require-concurrent-index-creation
-- Cleanup state for abandoned uploads. cleanup_claimed_at is set once, under the
-- same row lock the attach path takes, and makes the upload unattachable before
-- its R2 object is deleted. The lease, attempt and availability columns drive
-- bounded, retried deletion. The retry index covers the same coalesce the claim
-- query uses and skips rows with neither timestamp (exhausted ones). Rows still
-- referenced by post_media are protected by the existing RESTRICT foreign key.
ALTER TABLE "media_reservation" ADD COLUMN "cleanup_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media_reservation" ADD COLUMN "cleanup_lease_token" text;--> statement-breakpoint
ALTER TABLE "media_reservation" ADD COLUMN "cleanup_lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media_reservation" ADD COLUMN "cleanup_attempts" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "media_reservation" ADD COLUMN "cleanup_available_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "media_reservation_cleanup_candidate_idx" ON "media_reservation" USING btree ("expires_at") WHERE "media_reservation"."cleanup_claimed_at" is null;--> statement-breakpoint
CREATE INDEX "media_reservation_cleanup_retry_idx" ON "media_reservation" USING btree (coalesce("cleanup_lease_expires_at", "cleanup_available_at")) WHERE "media_reservation"."cleanup_claimed_at" is not null and coalesce("media_reservation"."cleanup_lease_expires_at", "media_reservation"."cleanup_available_at") is not null;
