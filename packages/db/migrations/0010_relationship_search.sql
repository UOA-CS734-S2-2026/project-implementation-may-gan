-- squawk-ignore-file prefer-robust-stmts
-- squawk-ignore-file require-lock-timeout
-- squawk-ignore-file require-statement-timeout
-- squawk-ignore-file constraint-missing-not-valid
-- squawk-ignore-file adding-foreign-key-constraint
-- squawk-ignore-file require-concurrent-index-creation
-- squawk-ignore-file prefer-bigint-over-int

CREATE TABLE "relationship_search_quota" (
  "actor_id" text PRIMARY KEY NOT NULL REFERENCES "public"."user"("id") ON DELETE cascade,
  "window_started_at" timestamp with time zone NOT NULL,
  "request_count" integer NOT NULL,
  CONSTRAINT "relationship_search_quota_request_count_check" CHECK ("request_count" > 0)
);
--> statement-breakpoint
CREATE INDEX "user_username_discovery_idx" ON "user" USING btree (lower("username") text_pattern_ops) WHERE "username" IS NOT NULL;
