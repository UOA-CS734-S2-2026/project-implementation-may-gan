-- squawk-ignore-file require-lock-timeout
-- squawk-ignore-file require-statement-timeout
-- squawk-ignore-file prefer-robust-stmts
-- squawk-ignore-file constraint-missing-not-valid
-- The protected migrator sets lock/statement timeouts and applies this migration
-- atomically; see packages/db/migrations/reviews/ for the constraint-validation
-- reasoning specific to this table's current (small, pre-production) row count.
CREATE TYPE "public"."media_reservation_status" AS ENUM('pending', 'validated', 'failed');--> statement-breakpoint
CREATE TYPE "public"."media_validation_failure_reason" AS ENUM('byte_size_mismatch', 'format_mismatch', 'duration_exceeded', 'malformed_container', 'object_not_found');--> statement-breakpoint
ALTER TABLE "media_reservation" ADD COLUMN "status" "media_reservation_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "media_reservation" ADD COLUMN "failure_reason" "media_validation_failure_reason";--> statement-breakpoint
ALTER TABLE "media_reservation" ADD COLUMN "validated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media_reservation" ADD CONSTRAINT "media_reservation_status_consistency_check" CHECK (
    ("media_reservation"."status" = 'pending' and "media_reservation"."failure_reason" is null and "media_reservation"."validated_at" is null) or
    ("media_reservation"."status" = 'validated' and "media_reservation"."failure_reason" is null and "media_reservation"."validated_at" is not null) or
    ("media_reservation"."status" = 'failed' and "media_reservation"."failure_reason" is not null and "media_reservation"."validated_at" is not null)
  );