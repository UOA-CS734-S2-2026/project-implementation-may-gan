-- This trigger is the final Better Auth creation boundary. It is dormant until
-- a current effective Terms record exists and records no client timestamps.
-- squawk-ignore-file require-lock-timeout
-- squawk-ignore-file require-statement-timeout
-- squawk-ignore-file prefer-robust-stmts
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.enforce_registration_legal_admission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_terms_id text;
  admitted_terms_id text;
BEGIN
  -- Migration-owned imports have a reviewed privileged path. The ordinary app
  -- role cannot select legal metadata or manufacture an effective document.
  IF session_user = 'migrator' THEN
    RETURN NEW;
  END IF;

  SELECT id INTO current_terms_id
  FROM public.legal_document_versions
  WHERE kind = 'terms' AND status = 'effective' AND effective_at <= now()
  ORDER BY effective_at DESC, version DESC
  LIMIT 1;
  IF current_terms_id IS NULL THEN
    RETURN NEW;
  END IF;

  admitted_terms_id := current_setting('dayli.registration_terms_version', true);
  IF admitted_terms_id IS NULL OR admitted_terms_id <> current_terms_id THEN
    RAISE EXCEPTION 'Current Terms agreement and age declaration are required.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.terms_acceptances (user_id, terms_version_id)
  VALUES (NEW.id, current_terms_id)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.age_declarations (user_id, declaration_version)
  VALUES (NEW.id, 'age-16-v1')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.enforce_registration_legal_admission() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.enforce_registration_legal_admission() TO app;--> statement-breakpoint
CREATE TRIGGER dayli_user_registration_legal_admission
AFTER INSERT ON public."user"
FOR EACH ROW EXECUTE FUNCTION public.enforce_registration_legal_admission();
