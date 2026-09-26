-- squawk-ignore-file prefer-robust-stmts
-- squawk-ignore-file require-lock-timeout
-- squawk-ignore-file require-statement-timeout
-- squawk-ignore-file constraint-missing-not-valid
-- squawk-ignore-file adding-foreign-key-constraint
-- squawk-ignore-file require-concurrent-index-creation

-- Retriable daily-post submissions record their accepted outcome here. The
-- snapshot also records media_reservation (0003) and the daily prompt
-- canonical-ID check (0004), which earlier snapshots omitted; both already
-- exist in the database, so this migration creates only the new table.
CREATE TABLE "post_idempotency_keys" (
	"author_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"post_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_idempotency_keys_pk" PRIMARY KEY("author_id","idempotency_key"),
	CONSTRAINT "post_idempotency_keys_key_check" CHECK (char_length("post_idempotency_keys"."idempotency_key") between 1 and 255),
	CONSTRAINT "post_idempotency_keys_fingerprint_check" CHECK ("post_idempotency_keys"."request_fingerprint" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "post_idempotency_keys" ADD CONSTRAINT "post_idempotency_keys_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_idempotency_keys" ADD CONSTRAINT "post_idempotency_keys_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_idempotency_keys_post_id_idx" ON "post_idempotency_keys" USING btree ("post_id");
