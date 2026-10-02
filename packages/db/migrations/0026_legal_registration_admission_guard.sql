-- Fail closed if Terms become effective before a reviewed registration-intent
-- bridge can atomically link the explicit action to a new Better Auth user.
-- This guard must be extended, not disabled, when email and Google admission
-- are implemented. Draft and notice documents do not affect registration.
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
CREATE FUNCTION public.deny_unproved_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Reviewed migration-owned imports are not ordinary public registration.
  IF session_user = 'migrator' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.legal_document_versions
    WHERE kind = 'terms' AND status = 'effective' AND effective_at <= now()
  ) THEN
    RAISE EXCEPTION 'Registration requires verified Terms acceptance.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.deny_unproved_registration() FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
CREATE TRIGGER dayli_deny_unproved_registration
BEFORE INSERT ON public."user"
FOR EACH ROW EXECUTE FUNCTION public.deny_unproved_registration();
