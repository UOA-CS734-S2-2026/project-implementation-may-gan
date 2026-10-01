-- squawk-ignore-file prefer-robust-stmts
-- squawk-ignore-file adding-foreign-key-constraint
-- squawk-ignore-file identifier-too-long
-- This expand-only migration keeps every legacy user reference and installs
-- trigger-maintained participant references before a participant runtime exists.
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
ALTER TABLE "conversation_changes" ADD COLUMN "member_participant_id" text;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD COLUMN "participant_id" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "participant_low_id" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "participant_high_id" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "initiator_participant_id" text;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD COLUMN "participant_id" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "sender_participant_id" text;--> statement-breakpoint
-- The migration runner executes this file transactionally. Its access-exclusive
-- column locks hold old writers until every trigger and backfill is committed,
-- so an old Worker cannot insert a row between the backfill and the triggers.
CREATE FUNCTION public.dayli_sync_conversation_participant_references() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.participant_low_id := NEW.user_low_id;
  NEW.participant_high_id := NEW.user_high_id;
  NEW.initiator_participant_id := NEW.initiator_id;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER dayli_conversations_participant_references
BEFORE INSERT OR UPDATE ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.dayli_sync_conversation_participant_references();--> statement-breakpoint
CREATE FUNCTION public.dayli_sync_conversation_member_participant_reference() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.participant_id := NEW.user_id;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER dayli_conversation_members_participant_reference
BEFORE INSERT OR UPDATE ON public.conversation_members
FOR EACH ROW EXECUTE FUNCTION public.dayli_sync_conversation_member_participant_reference();--> statement-breakpoint
CREATE FUNCTION public.dayli_sync_message_participant_reference() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.sender_participant_id := NEW.sender_id;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER dayli_messages_participant_reference
BEFORE INSERT OR UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.dayli_sync_message_participant_reference();--> statement-breakpoint
CREATE FUNCTION public.dayli_sync_reaction_participant_reference() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.participant_id := NEW.user_id;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER dayli_message_reactions_participant_reference
BEFORE INSERT OR UPDATE ON public.message_reactions
FOR EACH ROW EXECUTE FUNCTION public.dayli_sync_reaction_participant_reference();--> statement-breakpoint
CREATE FUNCTION public.dayli_sync_conversation_change_participant_reference() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.member_participant_id := NEW.member_id;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER dayli_conversation_changes_participant_reference
BEFORE INSERT OR UPDATE ON public.conversation_changes
FOR EACH ROW EXECUTE FUNCTION public.dayli_sync_conversation_change_participant_reference();--> statement-breakpoint
-- Populate rows written before this migration. The participant ID equals the
-- active user's opaque ID in this phase, and each source column remains the
-- runtime authority until the later participant API cutover.
UPDATE public.conversation_changes
SET member_participant_id = member_id
WHERE member_participant_id IS DISTINCT FROM member_id;--> statement-breakpoint
UPDATE public.conversation_members
SET participant_id = user_id
WHERE participant_id IS DISTINCT FROM user_id;--> statement-breakpoint
UPDATE public.conversations
SET participant_low_id = user_low_id,
    participant_high_id = user_high_id,
    initiator_participant_id = initiator_id
WHERE participant_low_id IS DISTINCT FROM user_low_id
   OR participant_high_id IS DISTINCT FROM user_high_id
   OR initiator_participant_id IS DISTINCT FROM initiator_id;--> statement-breakpoint
UPDATE public.message_reactions
SET participant_id = user_id
WHERE participant_id IS DISTINCT FROM user_id;--> statement-breakpoint
UPDATE public.messages
SET sender_participant_id = sender_id
WHERE sender_participant_id IS DISTINCT FROM sender_id;--> statement-breakpoint
-- NOT VALID avoids a table scan while each reference is installed. The updates
-- above touch every pre-existing row, then validation proves the backfill.
ALTER TABLE "conversation_changes" ADD CONSTRAINT "conversation_changes_member_participant_id_messaging_participants_id_fk" FOREIGN KEY ("member_participant_id") REFERENCES "public"."messaging_participants"("id") ON DELETE no action ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_participant_id_messaging_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."messaging_participants"("id") ON DELETE no action ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_participant_low_id_messaging_participants_id_fk" FOREIGN KEY ("participant_low_id") REFERENCES "public"."messaging_participants"("id") ON DELETE no action ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_participant_high_id_messaging_participants_id_fk" FOREIGN KEY ("participant_high_id") REFERENCES "public"."messaging_participants"("id") ON DELETE no action ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_initiator_participant_id_messaging_participants_id_fk" FOREIGN KEY ("initiator_participant_id") REFERENCES "public"."messaging_participants"("id") ON DELETE no action ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_participant_id_messaging_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."messaging_participants"("id") ON DELETE no action ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_participant_id_messaging_participants_id_fk" FOREIGN KEY ("sender_participant_id") REFERENCES "public"."messaging_participants"("id") ON DELETE no action ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "conversation_changes" VALIDATE CONSTRAINT "conversation_changes_member_participant_id_messaging_participants_id_fk";--> statement-breakpoint
ALTER TABLE "conversation_members" VALIDATE CONSTRAINT "conversation_members_participant_id_messaging_participants_id_fk";--> statement-breakpoint
ALTER TABLE "conversations" VALIDATE CONSTRAINT "conversations_participant_low_id_messaging_participants_id_fk";--> statement-breakpoint
ALTER TABLE "conversations" VALIDATE CONSTRAINT "conversations_participant_high_id_messaging_participants_id_fk";--> statement-breakpoint
ALTER TABLE "conversations" VALIDATE CONSTRAINT "conversations_initiator_participant_id_messaging_participants_id_fk";--> statement-breakpoint
ALTER TABLE "message_reactions" VALIDATE CONSTRAINT "message_reactions_participant_id_messaging_participants_id_fk";--> statement-breakpoint
ALTER TABLE "messages" VALIDATE CONSTRAINT "messages_sender_participant_id_messaging_participants_id_fk";