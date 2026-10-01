-- Serialize canonical content changes with publication and acceptance latching on
-- the same legal-version row. This closes the stale unlocked latch read in 0026.
-- squawk-ignore-file require-lock-timeout
-- squawk-ignore-file require-statement-timeout
-- squawk-ignore-file prefer-robust-stmts
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.enforce_legal_version_publication_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.publication_latched := NEW.publication_latched OR NEW.status IN ('notice', 'effective', 'superseded');
    RETURN NEW;
  END IF;

  -- The acceptance trigger sets NEW.publication_latched true. Preserve that
  -- value rather than deriving a false value again from its draft status.
  NEW.publication_latched := OLD.publication_latched OR NEW.publication_latched OR NEW.status IN ('notice', 'effective', 'superseded');
  IF OLD.publication_latched THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.kind IS DISTINCT FROM OLD.kind
      OR NEW.version IS DISTINCT FROM OLD.version
      OR NEW.content_digest IS DISTINCT FROM OLD.content_digest THEN
      RAISE EXCEPTION 'Published legal document identity and digest are immutable.' USING ERRCODE = '23514';
    END IF;
    IF NEW.status = 'draft' THEN
      RAISE EXCEPTION 'Published legal document cannot return to draft.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.enforce_legal_content_publication_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  parent record;
  parent_ids text[];
BEGIN
  -- Lock every affected parent in a stable order. A parent UPDATE that publishes
  -- or latches on acceptance takes a conflicting row lock before its trigger,
  -- so Read Committed waits and then observes the committed latch state.
  parent_ids := CASE TG_OP
    WHEN 'INSERT' THEN ARRAY[NEW.terms_version_id]
    WHEN 'DELETE' THEN ARRAY[OLD.terms_version_id]
    ELSE ARRAY[OLD.terms_version_id, NEW.terms_version_id]
  END;

  FOR parent IN
    SELECT id, publication_latched
    FROM public.legal_document_versions
    WHERE id = ANY(parent_ids)
    ORDER BY id
    FOR UPDATE
  LOOP
    IF parent.publication_latched THEN
      RAISE EXCEPTION 'Published legal document content is immutable.' USING ERRCODE = '23514';
    END IF;
  END LOOP;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;--> statement-breakpoint
