-- An explicit registration intent must be consumed in the same transaction as
-- Better Auth's user INSERT. The bridge never stores the raw bearer in a row.
-- Draft and notice documents do not activate this boundary. No content is
-- published and no existing acceptance is inferred by this migration.
-- squawk-ignore-file prefer-robust-stmts
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
ALTER TABLE public."user" ADD COLUMN legal_registration_admission text;--> statement-breakpoint
CREATE FUNCTION public.deny_unproved_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_terms_id text;
  parts text[];
  flow text;
  token text;
  binding text;
  claimed text;
BEGIN
  IF session_user = 'migrator' THEN
    NEW.legal_registration_admission := NULL;
    RETURN NEW;
  END IF;
  SELECT id INTO current_terms_id
  FROM public.legal_document_versions
  WHERE kind = 'terms' AND status = 'effective' AND effective_at <= now()
  ORDER BY effective_at DESC, version DESC
  LIMIT 1;
  IF current_terms_id IS NULL THEN
    NEW.legal_registration_admission := NULL;
    RETURN NEW;
  END IF;

  parts := string_to_array(NEW.legal_registration_admission, '|');
  IF coalesce(array_length(parts, 1), 0) <> 3 THEN
    RAISE EXCEPTION 'Registration requires verified Terms acceptance.' USING ERRCODE = '42501';
  END IF;
  flow := parts[1];
  token := parts[2];
  binding := parts[3];
  IF flow NOT IN ('email', 'google_native', 'google_browser')
    OR binding IS NULL OR char_length(binding) NOT BETWEEN 8 AND 256
    OR (flow <> 'google_browser' AND (token IS NULL OR token !~ '^[0-9a-f]{64}$'))
    OR (flow = 'google_browser' AND token <> '') THEN
    RAISE EXCEPTION 'Registration requires verified Terms acceptance.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.registration_intents AS ri
  SET consumed_at = now()
  WHERE ri.terms_version_id = current_terms_id
    AND ri.age_declaration_version = 'age-16-v1'
    AND ri.consumed_at IS NULL AND ri.expires_at > now()
    AND (
      (flow IN ('email', 'google_native')
        AND ri.token_digest = encode(sha256(convert_to(token, 'UTF8')), 'hex')
        AND ri.flow_binding_digest = encode(sha256(convert_to(flow || ':' || binding, 'UTF8')), 'hex'))
      OR (flow = 'google_browser'
        AND ri.flow_binding_digest = encode(sha256(convert_to('google_browser:' || binding, 'UTF8')), 'hex'))
    )
  RETURNING ri.token_digest INTO claimed;
  IF claimed IS NULL THEN
    RAISE EXCEPTION 'Registration requires verified Terms acceptance.' USING ERRCODE = '42501';
  END IF;
  NEW.legal_registration_admission := current_terms_id;
  RETURN NEW;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.deny_unproved_registration() FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
CREATE TRIGGER dayli_deny_unproved_registration
BEFORE INSERT ON public."user"
FOR EACH ROW EXECUTE FUNCTION public.deny_unproved_registration();--> statement-breakpoint
CREATE FUNCTION public.record_registration_legal_action()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.legal_registration_admission IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.terms_acceptances (user_id, terms_version_id)
  VALUES (NEW.id, NEW.legal_registration_admission);
  INSERT INTO public.age_declarations (user_id, declaration_version)
  VALUES (NEW.id, 'age-16-v1');
  UPDATE public."user" SET legal_registration_admission = NULL WHERE id = NEW.id;
  RETURN NEW;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.record_registration_legal_action() FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
CREATE TRIGGER dayli_record_registration_legal_action
AFTER INSERT ON public."user"
FOR EACH ROW EXECUTE FUNCTION public.record_registration_legal_action();--> statement-breakpoint
CREATE FUNCTION public.clear_registration_admission_on_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.legal_registration_admission := NULL;
  RETURN NEW;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.clear_registration_admission_on_update() FROM PUBLIC, app, lifecycle_worker;--> statement-breakpoint
CREATE TRIGGER dayli_clear_registration_admission_on_update
BEFORE UPDATE OF legal_registration_admission ON public."user"
FOR EACH ROW EXECUTE FUNCTION public.clear_registration_admission_on_update();
