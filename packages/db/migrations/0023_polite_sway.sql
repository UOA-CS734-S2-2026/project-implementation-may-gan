-- squawk-ignore-file prefer-robust-stmts
-- squawk-ignore-file adding-foreign-key-constraint
-- squawk-ignore-file constraint-missing-not-valid
-- squawk-ignore-file require-concurrent-index-creation
-- squawk-ignore-file disallowed-unique-constraint
-- squawk-ignore-file identifier-too-long
-- This migration intentionally retains every legacy user key, primary key,
-- foreign key, and cascade. It only makes the adjacent participant keys ready
-- for a later runtime cutover. It does not grant physical deletion.
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
-- Unique constraints build indexes in this transactional migrator, where
-- CREATE INDEX CONCURRENTLY is unavailable. Measure pg_total_relation_size for
-- these four tables before production, and reschedule if the five minute
-- statement timeout is not safe for the observed volume. The conversation gate
-- is ACCESS EXCLUSIVE so it blocks reads and writes while this migration runs.
-- Taking it first cannot deadlock with a worker that locks a conversation then
-- writes a lower table. A pre-existing lower-table writer makes a dependent
-- NOWAIT lock fail with 55P03, rolling the transaction back for a retry.
LOCK TABLE public.conversations IN ACCESS EXCLUSIVE MODE;--> statement-breakpoint
LOCK TABLE public.conversation_members IN ACCESS EXCLUSIVE MODE NOWAIT;--> statement-breakpoint
LOCK TABLE public.messages IN ACCESS EXCLUSIVE MODE NOWAIT;--> statement-breakpoint
LOCK TABLE public.message_reactions IN ACCESS EXCLUSIVE MODE NOWAIT;--> statement-breakpoint
LOCK TABLE public.conversation_changes IN ACCESS EXCLUSIVE MODE NOWAIT;--> statement-breakpoint
-- A prior read-only staging preflight is advisory until these locks stop all
-- five-table writers. Recheck under the final gate before changing data or
-- building constraints. Staging must use the fixed 16 MiB cap. Production
-- also rechecks, using its explicit reviewed manual cap setting.
DO $$
DECLARE
  migration_target text := COALESCE(current_setting('dayli.migration_target', true), 'local');
  cap_text text := COALESCE(current_setting('dayli.messaging_0023_size_cap_bytes', true), '16777216');
  cap_bytes bigint;
  table_count integer;
  total_bytes numeric;
BEGIN
  IF cap_text !~ '^[0-9]+$' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'messaging readiness migration size cap is unavailable';
  END IF;
  cap_bytes := cap_text::bigint;
  IF cap_bytes < 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'messaging readiness migration size cap is unavailable';
  END IF;
  IF migration_target NOT IN ('local', 'development', 'staging', 'production') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'messaging readiness migration target is unavailable';
  END IF;
  IF migration_target = 'staging' AND cap_bytes <> 16777216 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'messaging readiness migration staging size cap is invalid';
  END IF;
  SELECT count(*), COALESCE(sum(pg_total_relation_size(c.oid)), 0)
    INTO table_count, total_bytes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind IN ('r', 'p')
     AND c.relname IN ('conversations', 'conversation_members', 'messages', 'message_reactions', 'conversation_changes');
  IF table_count <> 5 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'messaging readiness migration locked size check is unavailable';
  END IF;
  IF total_bytes > cap_bytes THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'messaging readiness migration locked size cap exceeded';
  END IF;
END;
$$;--> statement-breakpoint
-- 0021 overwrote participant values for every update. These replacements derive
-- missing values for old user-ID writers, preserve a durable value when a later
-- legacy key is null, and reject an explicit non-matching replacement.
CREATE OR REPLACE FUNCTION public.dayli_sync_conversation_participant_references() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  expected_low_id text;
  expected_high_id text;
  expected_initiator_id text;
BEGIN
  IF NEW.user_low_id IS NULL THEN
    IF TG_OP = 'INSERT' AND NEW.participant_low_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation requires a legacy user or participant identity';
    ELSIF TG_OP = 'UPDATE' AND NEW.participant_low_id IS DISTINCT FROM OLD.participant_low_id THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation participant identity is durable';
    END IF;
  ELSE
    SELECT id INTO expected_low_id FROM public.messaging_participants WHERE user_id = NEW.user_low_id AND state = 'active';
    IF expected_low_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation legacy user has no active participant';
    ELSIF NEW.participant_low_id IS NULL AND (TG_OP = 'INSERT' OR OLD.participant_low_id IS NULL) THEN
      NEW.participant_low_id := expected_low_id;
    ELSIF NEW.participant_low_id IS DISTINCT FROM expected_low_id THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation participant does not match legacy user';
    END IF;
  END IF;

  IF NEW.user_high_id IS NULL THEN
    IF TG_OP = 'INSERT' AND NEW.participant_high_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation requires a legacy user or participant identity';
    ELSIF TG_OP = 'UPDATE' AND NEW.participant_high_id IS DISTINCT FROM OLD.participant_high_id THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation participant identity is durable';
    END IF;
  ELSE
    SELECT id INTO expected_high_id FROM public.messaging_participants WHERE user_id = NEW.user_high_id AND state = 'active';
    IF expected_high_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation legacy user has no active participant';
    ELSIF NEW.participant_high_id IS NULL AND (TG_OP = 'INSERT' OR OLD.participant_high_id IS NULL) THEN
      NEW.participant_high_id := expected_high_id;
    ELSIF NEW.participant_high_id IS DISTINCT FROM expected_high_id THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation participant does not match legacy user';
    END IF;
  END IF;

  IF NEW.initiator_id IS NULL THEN
    IF TG_OP = 'INSERT' AND NEW.initiator_participant_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation requires a legacy user or participant identity';
    ELSIF TG_OP = 'UPDATE' AND NEW.initiator_participant_id IS DISTINCT FROM OLD.initiator_participant_id THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation participant identity is durable';
    END IF;
  ELSE
    SELECT id INTO expected_initiator_id FROM public.messaging_participants WHERE user_id = NEW.initiator_id AND state = 'active';
    IF expected_initiator_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation legacy user has no active participant';
    ELSIF NEW.initiator_participant_id IS NULL AND (TG_OP = 'INSERT' OR OLD.initiator_participant_id IS NULL) THEN
      NEW.initiator_participant_id := expected_initiator_id;
    ELSIF NEW.initiator_participant_id IS DISTINCT FROM expected_initiator_id THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation participant does not match legacy user';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.dayli_sync_conversation_member_participant_reference() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  expected_participant_id text;
BEGIN
  IF NEW.user_id IS NULL THEN
    IF TG_OP = 'INSERT' AND NEW.participant_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation member requires a legacy user or participant identity';
    ELSIF TG_OP = 'UPDATE' AND NEW.participant_id IS DISTINCT FROM OLD.participant_id THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation member participant identity is durable';
    END IF;
  ELSE
    SELECT id INTO expected_participant_id FROM public.messaging_participants WHERE user_id = NEW.user_id AND state = 'active';
    IF expected_participant_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation member legacy user has no active participant';
    ELSIF NEW.participant_id IS NULL AND (TG_OP = 'INSERT' OR OLD.participant_id IS NULL) THEN
      NEW.participant_id := expected_participant_id;
    ELSIF NEW.participant_id IS DISTINCT FROM expected_participant_id THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation member participant does not match legacy user';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.dayli_sync_message_participant_reference() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  expected_participant_id text;
BEGIN
  IF NEW.sender_id IS NULL THEN
    IF TG_OP = 'INSERT' AND NEW.sender_participant_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'message requires a legacy sender or participant identity';
    ELSIF TG_OP = 'UPDATE' AND NEW.sender_participant_id IS DISTINCT FROM OLD.sender_participant_id THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'message sender participant identity is durable';
    END IF;
  ELSE
    SELECT id INTO expected_participant_id FROM public.messaging_participants WHERE user_id = NEW.sender_id AND state = 'active';
    IF expected_participant_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'message legacy sender has no active participant';
    ELSIF NEW.sender_participant_id IS NULL AND (TG_OP = 'INSERT' OR OLD.sender_participant_id IS NULL) THEN
      NEW.sender_participant_id := expected_participant_id;
    ELSIF NEW.sender_participant_id IS DISTINCT FROM expected_participant_id THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'message sender participant does not match legacy user';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.dayli_sync_reaction_participant_reference() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  expected_participant_id text;
BEGIN
  IF NEW.user_id IS NULL THEN
    IF TG_OP = 'INSERT' AND NEW.participant_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'reaction requires a legacy user or participant identity';
    ELSIF TG_OP = 'UPDATE' AND NEW.participant_id IS DISTINCT FROM OLD.participant_id THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'reaction participant identity is durable';
    END IF;
  ELSE
    SELECT id INTO expected_participant_id FROM public.messaging_participants WHERE user_id = NEW.user_id AND state = 'active';
    IF expected_participant_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'reaction legacy user has no active participant';
    ELSIF NEW.participant_id IS NULL AND (TG_OP = 'INSERT' OR OLD.participant_id IS NULL) THEN
      NEW.participant_id := expected_participant_id;
    ELSIF NEW.participant_id IS DISTINCT FROM expected_participant_id THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'reaction participant does not match legacy user';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.dayli_sync_conversation_change_participant_reference() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  expected_participant_id text;
BEGIN
  IF NEW.member_id IS NULL THEN
    IF TG_OP = 'UPDATE' AND NEW.member_participant_id IS DISTINCT FROM OLD.member_participant_id THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation change participant identity is durable';
    END IF;
  ELSE
    SELECT id INTO expected_participant_id FROM public.messaging_participants WHERE user_id = NEW.member_id AND state = 'active';
    IF expected_participant_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation change legacy member has no active participant';
    ELSIF NEW.member_participant_id IS NULL AND (TG_OP = 'INSERT' OR OLD.member_participant_id IS NULL) THEN
      NEW.member_participant_id := expected_participant_id;
    ELSIF NEW.member_participant_id IS DISTINCT FROM expected_participant_id THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'conversation change participant does not match legacy user';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
-- The 0021 migration populated every row. These predicates keep this repair
-- bounded to a prior interrupted or manually altered state.
UPDATE public.conversations
SET participant_low_id = user_low_id,
    participant_high_id = user_high_id,
    initiator_participant_id = initiator_id
WHERE participant_low_id IS NULL
   OR participant_high_id IS NULL
   OR initiator_participant_id IS NULL;--> statement-breakpoint
UPDATE public.conversation_members SET participant_id = user_id WHERE participant_id IS NULL;--> statement-breakpoint
UPDATE public.messages SET sender_participant_id = sender_id WHERE sender_participant_id IS NULL;--> statement-breakpoint
UPDATE public.message_reactions SET participant_id = user_id WHERE participant_id IS NULL;--> statement-breakpoint
UPDATE public.conversation_changes SET member_participant_id = member_id WHERE member_id IS NOT NULL AND member_participant_id IS NULL;--> statement-breakpoint
ALTER TABLE public.conversations ADD CONSTRAINT "conversations_participant_presence_check" CHECK (participant_low_id IS NOT NULL AND participant_high_id IS NOT NULL AND initiator_participant_id IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE public.conversation_members ADD CONSTRAINT "conversation_members_participant_presence_check" CHECK (participant_id IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE public.messages ADD CONSTRAINT "messages_sender_participant_presence_check" CHECK (sender_participant_id IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE public.message_reactions ADD CONSTRAINT "message_reactions_participant_presence_check" CHECK (participant_id IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE public.conversations ADD CONSTRAINT "conversations_participant_direct_pair_order_check" CHECK (participant_low_id < participant_high_id) NOT VALID;--> statement-breakpoint
ALTER TABLE public.conversations ADD CONSTRAINT "conversations_participant_initiator_member_check" CHECK (initiator_participant_id IN (participant_low_id, participant_high_id)) NOT VALID;--> statement-breakpoint
ALTER TABLE public.conversations VALIDATE CONSTRAINT "conversations_participant_presence_check";--> statement-breakpoint
ALTER TABLE public.conversation_members VALIDATE CONSTRAINT "conversation_members_participant_presence_check";--> statement-breakpoint
ALTER TABLE public.messages VALIDATE CONSTRAINT "messages_sender_participant_presence_check";--> statement-breakpoint
ALTER TABLE public.message_reactions VALIDATE CONSTRAINT "message_reactions_participant_presence_check";--> statement-breakpoint
ALTER TABLE public.conversations VALIDATE CONSTRAINT "conversations_participant_direct_pair_order_check";--> statement-breakpoint
ALTER TABLE public.conversations VALIDATE CONSTRAINT "conversations_participant_initiator_member_check";--> statement-breakpoint
ALTER TABLE public.conversations ADD CONSTRAINT "conversations_participant_direct_pair_unique" UNIQUE (participant_low_id, participant_high_id);--> statement-breakpoint
ALTER TABLE public.conversation_members ADD CONSTRAINT "conversation_members_participant_unique" UNIQUE (conversation_id, participant_id);--> statement-breakpoint
ALTER TABLE public.messages ADD CONSTRAINT "messages_sender_participant_client_message_unique" UNIQUE (sender_participant_id, client_message_id);--> statement-breakpoint
ALTER TABLE public.message_reactions ADD CONSTRAINT "message_reactions_participant_unique" UNIQUE (message_id, participant_id);