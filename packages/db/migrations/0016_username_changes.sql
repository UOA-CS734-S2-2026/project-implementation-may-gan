-- squawk-ignore-file adding-foreign-key-constraint
-- squawk-ignore-file constraint-missing-not-valid
-- squawk-ignore-file prefer-robust-stmts
-- squawk-ignore-file require-concurrent-index-creation
-- squawk-ignore-file require-lock-timeout
-- squawk-ignore-file require-statement-timeout
CREATE TABLE "username_reservations" (
	"username" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"reserved_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "username_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "username_reservations" ADD CONSTRAINT "username_reservations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "username_reservations_user_id_idx" ON "username_reservations" USING btree ("user_id");--> statement-breakpoint
-- A handle given up by a username change stays reserved for its previous
-- owner. The claim runs under the same per-handle advisory lock as before, so
-- a reservation and a concurrent claim cannot both succeed.
CREATE OR REPLACE FUNCTION public.enforce_case_insensitive_username()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.username IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.username := lower(NEW.username);
  IF NEW.username !~ '^[a-z0-9][a-z0-9_]{2,29}$' THEN
    RAISE EXCEPTION 'username has an invalid format' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('dayli:username:' || NEW.username, 145));

  IF EXISTS (
    SELECT 1
    FROM public."user" AS candidate
    WHERE lower(candidate.username) = NEW.username
      AND candidate.id <> NEW.id
  ) OR EXISTS (
    SELECT 1
    FROM public.username_reservations AS reservation
    WHERE reservation.username = NEW.username
      AND reservation.user_id <> NEW.id
      AND reservation.reserved_until > now()
  ) THEN
    RAISE EXCEPTION 'username is already claimed' USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;
