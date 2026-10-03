-- squawk-ignore-file prefer-robust-stmts
-- squawk-ignore-file adding-foreign-key-constraint
-- squawk-ignore-file constraint-missing-not-valid
-- squawk-ignore-file require-concurrent-index-creation
-- squawk-ignore-file disallowed-unique-constraint
-- squawk-ignore-file identifier-too-long
-- squawk-ignore-file ban-drop-not-null
-- squawk-ignore-file adding-serial-primary-key-field
-- This is the FK-detachment contract. It retains legacy user IDs for rolling
-- workers, but durable participant identities own retained messaging rows.
-- It does not enable any user purge path or grant participant mutation access.
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
-- Lock the referenced user table first. A deletion holds this table before it
-- takes referential-action locks, so this order cannot recreate the former
-- conversation/lower-table cycle. The five messaging tables then follow the
-- worker order, with NOWAIT on lower tables to fail safely rather than deadlock.
LOCK TABLE public."user" IN SHARE ROW EXCLUSIVE MODE;--> statement-breakpoint
LOCK TABLE public.conversations IN ACCESS EXCLUSIVE MODE;--> statement-breakpoint
LOCK TABLE public.conversation_members IN ACCESS EXCLUSIVE MODE NOWAIT;--> statement-breakpoint
LOCK TABLE public.messages IN ACCESS EXCLUSIVE MODE NOWAIT;--> statement-breakpoint
LOCK TABLE public.message_reactions IN ACCESS EXCLUSIVE MODE NOWAIT;--> statement-breakpoint
LOCK TABLE public.conversation_changes IN ACCESS EXCLUSIVE MODE NOWAIT;--> statement-breakpoint
-- The mandatory staging preflight is read-only and advisory until these final
-- locks exclude writers. Recheck the same combined five-table total before any
-- data definition change or index build. Staging is always 16 MiB.
DO $$
DECLARE
  migration_target text := COALESCE(current_setting('dayli.migration_target', true), 'local');
  cap_text text := COALESCE(current_setting('dayli.messaging_0024_size_cap_bytes', true), '16777216');
  cap_bytes bigint;
  table_count integer;
  total_bytes numeric;
BEGIN
  IF cap_text !~ '^[0-9]+$' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'messaging FK detachment size cap is unavailable';
  END IF;
  cap_bytes := cap_text::bigint;
  IF cap_bytes < 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'messaging FK detachment size cap is unavailable';
  END IF;
  IF migration_target NOT IN ('local', 'development', 'staging', 'production') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'messaging FK detachment migration target is unavailable';
  END IF;
  IF migration_target = 'staging' AND cap_bytes <> 16777216 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'messaging FK detachment staging size cap is invalid';
  END IF;
  SELECT count(*), COALESCE(sum(pg_total_relation_size(c.oid)), 0)
    INTO table_count, total_bytes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind IN ('r', 'p')
     AND c.relname IN ('conversations', 'conversation_members', 'messages', 'message_reactions', 'conversation_changes');
  IF table_count <> 5 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'messaging FK detachment locked size check is unavailable';
  END IF;
  IF total_bytes > cap_bytes THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'messaging FK detachment locked size cap exceeded';
  END IF;
END;
$$;--> statement-breakpoint
-- A user-detach SET NULL update must preserve durable participant IDs. Only
-- changed legacy keys need a fresh active-participant lookup. This lets the
-- three independent FK actions on conversations run in any order while old
-- user-ID inserts continue to derive identity and explicit replacements fail.
CREATE OR REPLACE FUNCTION public.dayli_sync_conversation_participant_references() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  expected_low_id text;
  expected_high_id text;
  expected_initiator_id text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.participant_low_id IS DISTINCT FROM OLD.participant_low_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation participant identity is durable';
  END IF;
  IF TG_OP = 'INSERT' OR NEW.user_low_id IS DISTINCT FROM OLD.user_low_id THEN
    IF NEW.user_low_id IS NULL THEN
      IF TG_OP = 'INSERT' THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation requires an active legacy user identity';
      END IF;
      PERFORM 1 FROM public.messaging_participants
       WHERE id = NEW.participant_low_id AND state = 'deleted' AND user_id IS NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation legacy user may detach only with its deleted participant';
      END IF;
    ELSE
      SELECT id INTO expected_low_id FROM public.messaging_participants WHERE user_id = NEW.user_low_id AND state = 'active';
      IF expected_low_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation legacy user has no active participant';
      ELSIF NEW.participant_low_id IS NULL THEN
        NEW.participant_low_id := expected_low_id;
      ELSIF NEW.participant_low_id IS DISTINCT FROM expected_low_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation participant does not match legacy user';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.participant_high_id IS DISTINCT FROM OLD.participant_high_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation participant identity is durable';
  END IF;
  IF TG_OP = 'INSERT' OR NEW.user_high_id IS DISTINCT FROM OLD.user_high_id THEN
    IF NEW.user_high_id IS NULL THEN
      IF TG_OP = 'INSERT' THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation requires an active legacy user identity';
      END IF;
      PERFORM 1 FROM public.messaging_participants
       WHERE id = NEW.participant_high_id AND state = 'deleted' AND user_id IS NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation legacy user may detach only with its deleted participant';
      END IF;
    ELSE
      SELECT id INTO expected_high_id FROM public.messaging_participants WHERE user_id = NEW.user_high_id AND state = 'active';
      IF expected_high_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation legacy user has no active participant';
      ELSIF NEW.participant_high_id IS NULL THEN
        NEW.participant_high_id := expected_high_id;
      ELSIF NEW.participant_high_id IS DISTINCT FROM expected_high_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation participant does not match legacy user';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.initiator_participant_id IS DISTINCT FROM OLD.initiator_participant_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation participant identity is durable';
  END IF;
  IF TG_OP = 'INSERT' OR NEW.initiator_id IS DISTINCT FROM OLD.initiator_id THEN
    IF NEW.initiator_id IS NULL THEN
      IF TG_OP = 'INSERT' THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation requires an active legacy user identity';
      END IF;
      PERFORM 1 FROM public.messaging_participants
       WHERE id = NEW.initiator_participant_id AND state = 'deleted' AND user_id IS NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation legacy user may detach only with its deleted participant';
      END IF;
    ELSE
      SELECT id INTO expected_initiator_id FROM public.messaging_participants WHERE user_id = NEW.initiator_id AND state = 'active';
      IF expected_initiator_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation legacy user has no active participant';
      ELSIF NEW.initiator_participant_id IS NULL THEN
        NEW.initiator_participant_id := expected_initiator_id;
      ELSIF NEW.initiator_participant_id IS DISTINCT FROM expected_initiator_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation participant does not match legacy user';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.dayli_sync_conversation_member_participant_reference() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE expected_participant_id text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.participant_id IS DISTINCT FROM OLD.participant_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation member participant identity is durable';
  END IF;
  IF TG_OP = 'INSERT' OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    IF NEW.user_id IS NULL THEN
      IF TG_OP = 'INSERT' THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation member requires an active legacy user identity';
      END IF;
      PERFORM 1 FROM public.messaging_participants
       WHERE id = NEW.participant_id AND state = 'deleted' AND user_id IS NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation member legacy user may detach only with its deleted participant';
      END IF;
    ELSE
      SELECT id INTO expected_participant_id FROM public.messaging_participants WHERE user_id = NEW.user_id AND state = 'active';
      IF expected_participant_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation member legacy user has no active participant';
      ELSIF NEW.participant_id IS NULL THEN
        NEW.participant_id := expected_participant_id;
      ELSIF NEW.participant_id IS DISTINCT FROM expected_participant_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation member participant does not match legacy user';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.dayli_sync_message_participant_reference() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE expected_participant_id text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.sender_participant_id IS DISTINCT FROM OLD.sender_participant_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'message sender participant identity is durable';
  END IF;
  IF TG_OP = 'INSERT' OR NEW.sender_id IS DISTINCT FROM OLD.sender_id THEN
    IF NEW.sender_id IS NULL THEN
      IF TG_OP = 'INSERT' THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'message requires an active legacy sender identity';
      END IF;
      PERFORM 1 FROM public.messaging_participants
       WHERE id = NEW.sender_participant_id AND state = 'deleted' AND user_id IS NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'message sender may detach only with its deleted participant';
      END IF;
    ELSE
      SELECT id INTO expected_participant_id FROM public.messaging_participants WHERE user_id = NEW.sender_id AND state = 'active';
      IF expected_participant_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'message legacy sender has no active participant';
      ELSIF NEW.sender_participant_id IS NULL THEN
        NEW.sender_participant_id := expected_participant_id;
      ELSIF NEW.sender_participant_id IS DISTINCT FROM expected_participant_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'message sender participant does not match legacy user';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.dayli_sync_reaction_participant_reference() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE expected_participant_id text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.participant_id IS DISTINCT FROM OLD.participant_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'reaction participant identity is durable';
  END IF;
  IF TG_OP = 'INSERT' OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    IF NEW.user_id IS NULL THEN
      IF TG_OP = 'INSERT' THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'reaction requires an active legacy user identity';
      END IF;
      PERFORM 1 FROM public.messaging_participants
       WHERE id = NEW.participant_id AND state = 'deleted' AND user_id IS NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'reaction legacy user may detach only with its deleted participant';
      END IF;
    ELSE
      SELECT id INTO expected_participant_id FROM public.messaging_participants WHERE user_id = NEW.user_id AND state = 'active';
      IF expected_participant_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'reaction legacy user has no active participant';
      ELSIF NEW.participant_id IS NULL THEN
        NEW.participant_id := expected_participant_id;
      ELSIF NEW.participant_id IS DISTINCT FROM expected_participant_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'reaction participant does not match legacy user';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.dayli_sync_conversation_change_participant_reference() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE expected_participant_id text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.member_participant_id IS DISTINCT FROM OLD.member_participant_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation change participant identity is durable';
  END IF;
  IF TG_OP = 'INSERT' OR NEW.member_id IS DISTINCT FROM OLD.member_id THEN
    IF NEW.member_id IS NULL THEN
      IF TG_OP = 'INSERT' THEN
        IF NEW.member_participant_id IS NOT NULL THEN
          RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'actorless conversation change requires null member identities';
        END IF;
      ELSE
        PERFORM 1 FROM public.messaging_participants
         WHERE id = NEW.member_participant_id AND state = 'deleted' AND user_id IS NULL;
        IF NOT FOUND THEN
          RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation change member may detach only with its deleted participant';
        END IF;
      END IF;
    ELSE
      SELECT id INTO expected_participant_id FROM public.messaging_participants WHERE user_id = NEW.member_id AND state = 'active';
      IF expected_participant_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation change legacy member has no active participant';
      ELSIF NEW.member_participant_id IS NULL THEN
        NEW.member_participant_id := expected_participant_id;
      ELSIF NEW.member_participant_id IS DISTINCT FROM expected_participant_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation change participant does not match legacy user';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
-- Replace only the seven direct user cascades. The outbox recipient cascade
-- deliberately remains a user-owned delivery record.
ALTER TABLE public.conversation_changes DROP CONSTRAINT "conversation_changes_member_id_user_id_fk";--> statement-breakpoint
ALTER TABLE public.conversation_members DROP CONSTRAINT "conversation_members_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE public.conversations DROP CONSTRAINT "conversations_user_low_id_user_id_fk";--> statement-breakpoint
ALTER TABLE public.conversations DROP CONSTRAINT "conversations_user_high_id_user_id_fk";--> statement-breakpoint
ALTER TABLE public.conversations DROP CONSTRAINT "conversations_initiator_id_user_id_fk";--> statement-breakpoint
ALTER TABLE public.message_reactions DROP CONSTRAINT "message_reactions_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE public.messages DROP CONSTRAINT "messages_sender_id_user_id_fk";--> statement-breakpoint
-- The legacy primary keys make their user columns implicitly NOT NULL. Drop
-- them before nullable conversion, then install participant primary keys below.
ALTER TABLE public.conversation_members DROP CONSTRAINT "conversation_members_pk";--> statement-breakpoint
ALTER TABLE public.message_reactions DROP CONSTRAINT "message_reactions_pk";--> statement-breakpoint
ALTER TABLE public.conversation_members ALTER COLUMN user_id DROP NOT NULL;--> statement-breakpoint
ALTER TABLE public.conversations ALTER COLUMN user_low_id DROP NOT NULL;--> statement-breakpoint
ALTER TABLE public.conversations ALTER COLUMN user_high_id DROP NOT NULL;--> statement-breakpoint
ALTER TABLE public.conversations ALTER COLUMN initiator_id DROP NOT NULL;--> statement-breakpoint
ALTER TABLE public.message_reactions ALTER COLUMN user_id DROP NOT NULL;--> statement-breakpoint
ALTER TABLE public.messages ALTER COLUMN sender_id DROP NOT NULL;--> statement-breakpoint
ALTER TABLE public.conversation_changes ADD CONSTRAINT "conversation_changes_member_id_user_id_fk" FOREIGN KEY (member_id) REFERENCES public."user"(id) ON DELETE SET NULL NOT VALID;--> statement-breakpoint
ALTER TABLE public.conversation_members ADD CONSTRAINT "conversation_members_user_id_user_id_fk" FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE SET NULL NOT VALID;--> statement-breakpoint
ALTER TABLE public.conversations ADD CONSTRAINT "conversations_user_low_id_user_id_fk" FOREIGN KEY (user_low_id) REFERENCES public."user"(id) ON DELETE SET NULL NOT VALID;--> statement-breakpoint
ALTER TABLE public.conversations ADD CONSTRAINT "conversations_user_high_id_user_id_fk" FOREIGN KEY (user_high_id) REFERENCES public."user"(id) ON DELETE SET NULL NOT VALID;--> statement-breakpoint
ALTER TABLE public.conversations ADD CONSTRAINT "conversations_initiator_id_user_id_fk" FOREIGN KEY (initiator_id) REFERENCES public."user"(id) ON DELETE SET NULL NOT VALID;--> statement-breakpoint
ALTER TABLE public.message_reactions ADD CONSTRAINT "message_reactions_user_id_user_id_fk" FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE SET NULL NOT VALID;--> statement-breakpoint
ALTER TABLE public.messages ADD CONSTRAINT "messages_sender_id_user_id_fk" FOREIGN KEY (sender_id) REFERENCES public."user"(id) ON DELETE SET NULL NOT VALID;--> statement-breakpoint
ALTER TABLE public.conversation_changes VALIDATE CONSTRAINT "conversation_changes_member_id_user_id_fk";--> statement-breakpoint
ALTER TABLE public.conversation_members VALIDATE CONSTRAINT "conversation_members_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE public.conversations VALIDATE CONSTRAINT "conversations_user_low_id_user_id_fk";--> statement-breakpoint
ALTER TABLE public.conversations VALIDATE CONSTRAINT "conversations_user_high_id_user_id_fk";--> statement-breakpoint
ALTER TABLE public.conversations VALIDATE CONSTRAINT "conversations_initiator_id_user_id_fk";--> statement-breakpoint
ALTER TABLE public.message_reactions VALIDATE CONSTRAINT "message_reactions_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE public.messages VALIDATE CONSTRAINT "messages_sender_id_user_id_fk";--> statement-breakpoint
-- Participant pairs become the durable primary keys. Preserve the former user
-- pairs as named unique conflict targets until every old worker is retired.
ALTER TABLE public.conversation_members DROP CONSTRAINT "conversation_members_participant_unique";--> statement-breakpoint
ALTER TABLE public.conversation_members ADD CONSTRAINT "conversation_members_pk" PRIMARY KEY (conversation_id, participant_id);--> statement-breakpoint
ALTER TABLE public.conversation_members ADD CONSTRAINT "conversation_members_legacy_user_unique" UNIQUE (conversation_id, user_id);--> statement-breakpoint
ALTER TABLE public.message_reactions DROP CONSTRAINT "message_reactions_participant_unique";--> statement-breakpoint
ALTER TABLE public.message_reactions ADD CONSTRAINT "message_reactions_pk" PRIMARY KEY (message_id, participant_id);--> statement-breakpoint
ALTER TABLE public.message_reactions ADD CONSTRAINT "message_reactions_legacy_user_unique" UNIQUE (message_id, user_id);