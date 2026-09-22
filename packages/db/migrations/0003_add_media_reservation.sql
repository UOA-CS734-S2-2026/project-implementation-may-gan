-- squawk-ignore-file require-lock-timeout
-- squawk-ignore-file require-statement-timeout
-- squawk-ignore-file prefer-robust-stmts
-- squawk-ignore-file constraint-missing-not-valid
-- squawk-ignore-file adding-foreign-key-constraint
-- squawk-ignore-file require-concurrent-index-creation
-- The migration runner sets lock and statement timeouts, and Drizzle applies this
-- new table and its empty-target foreign key/index atomically in one transaction.
CREATE TABLE "media_reservation" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "media_reservation_object_key_unique" UNIQUE("object_key")
);
--> statement-breakpoint
ALTER TABLE "media_reservation" ADD CONSTRAINT "media_reservation_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_reservation_owner_id_expires_at_idx" ON "media_reservation" USING btree ("owner_id","expires_at");