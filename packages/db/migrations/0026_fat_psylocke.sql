-- Published and accepted Terms retain an immutable version identity and canonical
-- source. Legacy rows are latched without asserting an unrecorded publication date.
-- squawk-ignore-file require-lock-timeout
-- squawk-ignore-file require-statement-timeout
-- squawk-ignore-file prefer-robust-stmts
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
ALTER TABLE public.legal_document_versions ADD COLUMN publication_latched boolean NOT NULL DEFAULT false;--> statement-breakpoint
UPDATE public.legal_document_versions lv
SET publication_latched = true
WHERE lv.status IN ('notice', 'effective', 'superseded')
   OR EXISTS (SELECT 1 FROM public.terms_acceptances ta WHERE ta.terms_version_id = lv.id);--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.enforce_legal_version_publication_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.publication_latched := NEW.status IN ('notice', 'effective', 'superseded');
    RETURN NEW;
  END IF;

  NEW.publication_latched := OLD.publication_latched OR NEW.status IN ('notice', 'effective', 'superseded');
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
CREATE TRIGGER dayli_legal_version_publication_immutability
BEFORE INSERT OR UPDATE ON public.legal_document_versions
FOR EACH ROW EXECUTE FUNCTION public.enforce_legal_version_publication_immutability();--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.prevent_published_legal_version_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.publication_latched THEN
    RAISE EXCEPTION 'Published legal document cannot be deleted.' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;--> statement-breakpoint
CREATE TRIGGER dayli_legal_version_publication_delete
BEFORE DELETE ON public.legal_document_versions
FOR EACH ROW EXECUTE FUNCTION public.prevent_published_legal_version_delete();--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.enforce_legal_content_publication_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  latched boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- A newly published legacy version may not yet have content. The primary
    -- key permits this one initial insert only. Every later mutation is blocked.
    RETURN NEW;
  END IF;

  SELECT publication_latched INTO latched
  FROM public.legal_document_versions
  WHERE id = OLD.terms_version_id;
  IF latched THEN
    RAISE EXCEPTION 'Published legal document content is immutable.' USING ERRCODE = '23514';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;--> statement-breakpoint
CREATE TRIGGER dayli_legal_content_publication_immutability
BEFORE INSERT OR UPDATE OR DELETE ON public.legal_document_contents
FOR EACH ROW EXECUTE FUNCTION public.enforce_legal_content_publication_immutability();--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.latch_accepted_terms_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.legal_document_versions
  SET publication_latched = true
  WHERE id = NEW.terms_version_id AND NOT publication_latched;
  RETURN NEW;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.latch_accepted_terms_version() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.latch_accepted_terms_version() TO app;--> statement-breakpoint
CREATE TRIGGER dayli_terms_acceptance_publication_latch
AFTER INSERT ON public.terms_acceptances
FOR EACH ROW EXECUTE FUNCTION public.latch_accepted_terms_version();--> statement-breakpoint
