-- squawk-ignore-file prefer-robust-stmts
-- squawk-ignore-file require-lock-timeout
-- squawk-ignore-file require-statement-timeout
-- squawk-ignore-file constraint-missing-not-valid
-- squawk-ignore-file adding-foreign-key-constraint
-- squawk-ignore-file require-concurrent-index-creation
-- Links each attachment to the validated upload that holds its bytes. The
-- column is nullable because legacy imports have no reservation. RESTRICT
-- stops reservation cleanup deleting an upload a post still uses; the partial
-- unique index lets each upload attach once, even after it is detached.
ALTER TABLE "post_media" ADD COLUMN "reservation_id" text;--> statement-breakpoint
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_reservation_id_media_reservation_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."media_reservation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "post_media_reservation_unique" ON "post_media" USING btree ("reservation_id") WHERE "post_media"."reservation_id" is not null;