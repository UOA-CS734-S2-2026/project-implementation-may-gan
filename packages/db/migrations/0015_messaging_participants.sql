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
-- Existing messaging rows are backfilled in the migration transaction. The
-- protected migration runner serializes this file with its advisory lock.
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
CREATE TYPE "public"."messaging_participant_state" AS ENUM('active', 'deleted');--> statement-breakpoint
CREATE TABLE "messaging_participants" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text,
  "state" "messaging_participant_state" DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "messaging_participants_user_id_unique" UNIQUE("user_id"),
  CONSTRAINT "messaging_participants_state_user_check" CHECK (("messaging_participants"."state" = 'active' and "messaging_participants"."user_id" is not null) or ("messaging_participants"."state" = 'deleted' and "messaging_participants"."user_id" is null))
);--> statement-breakpoint
-- Participant IDs deliberately begin equal to the pre-existing opaque user ID.
-- This preserves active-client DTO semantics while keeping a separate durable
-- participant row after the user, profile, and credentials are gone.
INSERT INTO "messaging_participants" ("id", "user_id", "state")
SELECT "id", "id", 'active' FROM public."user";--> statement-breakpoint
ALTER TABLE "conversation_changes" ADD COLUMN "member_participant_id" text;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD COLUMN "participant_id" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "participant_low_id" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "participant_high_id" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "initiator_participant_id" text;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD COLUMN "participant_id" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "sender_participant_id" text;--> statement-breakpoint
UPDATE "conversation_changes" SET "member_participant_id" = "member_id";--> statement-breakpoint
UPDATE "conversation_members" SET "participant_id" = "user_id";--> statement-breakpoint
UPDATE "conversations" SET "participant_low_id" = "user_low_id", "participant_high_id" = "user_high_id", "initiator_participant_id" = "initiator_id";--> statement-breakpoint
UPDATE "message_reactions" SET "participant_id" = "user_id";--> statement-breakpoint
UPDATE "messages" SET "sender_participant_id" = "sender_id";--> statement-breakpoint
ALTER TABLE "conversation_members" ALTER COLUMN "participant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "participant_low_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "participant_high_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "initiator_participant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "message_reactions" ALTER COLUMN "participant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "sender_participant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_direct_pair_unique";--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_sender_client_message_unique";--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_direct_pair_order_check";--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_initiator_member_check";--> statement-breakpoint
ALTER TABLE "conversation_members" DROP CONSTRAINT "conversation_members_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_user_low_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_user_high_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_initiator_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "message_reactions" DROP CONSTRAINT "message_reactions_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_sender_id_user_id_fk";--> statement-breakpoint
DROP INDEX "conversation_members_user_conversation_idx";--> statement-breakpoint
ALTER TABLE "conversation_members" DROP CONSTRAINT "conversation_members_pk";--> statement-breakpoint
ALTER TABLE "message_reactions" DROP CONSTRAINT "message_reactions_pk";--> statement-breakpoint
ALTER TABLE "conversation_changes" DROP COLUMN "member_id";--> statement-breakpoint
ALTER TABLE "conversation_members" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "conversations" DROP COLUMN "user_low_id";--> statement-breakpoint
ALTER TABLE "conversations" DROP COLUMN "user_high_id";--> statement-breakpoint
ALTER TABLE "conversations" DROP COLUMN "initiator_id";--> statement-breakpoint
ALTER TABLE "message_reactions" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN "sender_id";--> statement-breakpoint
ALTER TABLE "messaging_participants" ADD CONSTRAINT "messaging_participants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_changes" ADD CONSTRAINT "conversation_changes_member_participant_id_messaging_participants_id_fk" FOREIGN KEY ("member_participant_id") REFERENCES "public"."messaging_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_participant_id_messaging_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."messaging_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_participant_low_id_messaging_participants_id_fk" FOREIGN KEY ("participant_low_id") REFERENCES "public"."messaging_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_participant_high_id_messaging_participants_id_fk" FOREIGN KEY ("participant_high_id") REFERENCES "public"."messaging_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_initiator_participant_id_messaging_participants_id_fk" FOREIGN KEY ("initiator_participant_id") REFERENCES "public"."messaging_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_participant_id_messaging_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."messaging_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_participant_id_messaging_participants_id_fk" FOREIGN KEY ("sender_participant_id") REFERENCES "public"."messaging_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_pk" PRIMARY KEY("conversation_id", "participant_id");--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_pk" PRIMARY KEY("message_id", "participant_id");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_direct_pair_unique" UNIQUE("participant_low_id", "participant_high_id");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_client_message_unique" UNIQUE("sender_participant_id", "client_message_id");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_direct_pair_order_check" CHECK ("conversations"."participant_low_id" < "conversations"."participant_high_id");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_initiator_member_check" CHECK ("conversations"."initiator_participant_id" in ("conversations"."participant_low_id", "conversations"."participant_high_id"));--> statement-breakpoint
CREATE INDEX "conversation_members_participant_conversation_idx" ON "conversation_members" USING btree ("participant_id", "conversation_id");--> statement-breakpoint
CREATE INDEX "messaging_participants_active_user_idx" ON "messaging_participants" USING btree ("user_id");--> statement-breakpoint
-- This view is an inspection-only handoff to #161. A candidate is not an
-- authorization to destroy data. The lifecycle claim must separately prove
-- that every cancellation window has irreversibly ended.
CREATE VIEW public.messaging_retained_conversation_candidates AS
SELECT conversation.id
FROM public.conversations conversation
WHERE NOT EXISTS (
  SELECT 1 FROM public.messaging_participants participant
  WHERE participant.id IN (conversation.participant_low_id, conversation.participant_high_id)
    AND participant.state = 'active'
);--> statement-breakpoint
-- This trigger only detaches the profile-free participant. It does not delete
-- conversations or run lifecycle work. #161 owns authorization, claiming, and
-- any later destructive conversation cleanup after cancellation windows end.
CREATE FUNCTION public.dayli_detach_messaging_participant() RETURNS trigger
LANGUAGE plpgsql
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
