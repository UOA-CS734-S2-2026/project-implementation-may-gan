-- squawk-ignore-file prefer-robust-stmts
-- squawk-ignore-file prefer-bigint-over-int
-- squawk-ignore-file constraint-missing-not-valid
-- squawk-ignore-file adding-foreign-key-constraint
-- squawk-ignore-file require-concurrent-index-creation
-- squawk-ignore-file adding-not-nullable-field
-- squawk-ignore-file require-concurrent-index-deletion
-- squawk-ignore-file ban-drop-column
-- squawk-ignore-file identifier-too-long
-- squawk-ignore-file adding-serial-primary-key-field
-- squawk-ignore-file disallowed-unique-constraint
-- This is the schema-only first phase. Existing messaging references remain on
-- user IDs, so the deployed runtime continues to use the pre-existing tables.
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
-- Hold the table lock needed later for trigger installation before any migration
-- work. This prevents a later lock upgrade from deadlocking with a concurrent
-- SELECT FOR UPDATE followed by a user write. It also blocks signup and
-- deletion writes until both triggers are installed in this transaction.
LOCK TABLE public."user" IN SHARE ROW EXCLUSIVE MODE;--> statement-breakpoint
CREATE TYPE "public"."messaging_participant_state" AS ENUM('active', 'deleted');--> statement-breakpoint
CREATE TABLE "messaging_participants" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text,
  "state" "messaging_participant_state" DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "messaging_participants_user_id_unique" UNIQUE("user_id"),
  CONSTRAINT "messaging_participants_state_user_check" CHECK (("messaging_participants"."state" = 'active' and "messaging_participants"."user_id" is not null) or ("messaging_participants"."state" = 'deleted' and "messaging_participants"."user_id" is null))
);--> statement-breakpoint
-- Every existing user receives a participant with the same opaque ID. New
-- runtime code is not deployed in this phase and does not read this table.
INSERT INTO "messaging_participants" ("id", "user_id", "state")
SELECT "id", "id", 'active' FROM public."user";--> statement-breakpoint
ALTER TABLE "messaging_participants" ADD CONSTRAINT "messaging_participants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messaging_participants_active_user_idx" ON "messaging_participants" USING btree ("user_id");--> statement-breakpoint
-- Deletion is still unavailable to the application in this phase. If a later
-- reviewed lifecycle procedure deletes a user, this trigger only detaches the
-- participant. It never deletes a conversation or changes a message row.
CREATE FUNCTION public.dayli_detach_messaging_participant() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.messaging_participants
  SET user_id = NULL, state = 'deleted'
  WHERE user_id = OLD.id;
  RETURN OLD;
END;
$$;--> statement-breakpoint
CREATE TRIGGER dayli_user_messaging_participant_detach
BEFORE DELETE ON public."user"
FOR EACH ROW EXECUTE FUNCTION public.dayli_detach_messaging_participant();--> statement-breakpoint
CREATE FUNCTION public.dayli_create_messaging_participant() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.messaging_participants (id, user_id, state)
  VALUES (NEW.id, NEW.id, 'active');
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER dayli_user_messaging_participant_create
AFTER INSERT ON public."user"
FOR EACH ROW EXECUTE FUNCTION public.dayli_create_messaging_participant();--> statement-breakpoint
-- Phase two grants the runtime only the participant access it needs. Until
-- then, participant rows are maintained exclusively by database-owned triggers.
REVOKE ALL ON TABLE public.messaging_participants FROM app, lifecycle_worker;