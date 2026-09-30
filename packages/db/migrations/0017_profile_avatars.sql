-- squawk-ignore-file adding-foreign-key-constraint
-- squawk-ignore-file constraint-missing-not-valid
-- squawk-ignore-file prefer-robust-stmts
-- squawk-ignore-file require-lock-timeout
-- squawk-ignore-file require-statement-timeout
CREATE TABLE "profile_avatars" (
	"user_id" text PRIMARY KEY NOT NULL,
	"reservation_id" text NOT NULL,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_avatars_reservation_id_unique" UNIQUE("reservation_id")
);
--> statement-breakpoint
ALTER TABLE "profile_avatars" ADD CONSTRAINT "profile_avatars_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_avatars" ADD CONSTRAINT "profile_avatars_reservation_id_media_reservation_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."media_reservation"("id") ON DELETE cascade ON UPDATE no action;