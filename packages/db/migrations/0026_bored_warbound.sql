-- The admission is carried in the row that Better Auth actually inserts, never
-- in a connection setting. The trigger consumes it and clears the bridge field.
-- squawk-ignore-file require-lock-timeout
-- squawk-ignore-file require-statement-timeout
-- squawk-ignore-file prefer-robust-stmts
SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '5min';--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "legal_registration_admission" text;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.enforce_registration_legal_admission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_terms_id text;
  current_digest text;
  admission_parts text[];
  admission_flow text;
  admission_token text;
  admission_binding text;
  consumed_digest text;
BEGIN
  IF session_user = 'migrator' THEN
    RETURN NEW;
  END IF;

  -- Legacy material rows with no notice provenance remain historical only. They
  -- cannot become a current/admissible Terms document through this upgrade.
  SELECT id, content_digest INTO current_terms_id, current_digest
  FROM public.legal_document_versions
  WHERE kind = 'terms' AND status = 'effective' AND effective_at <= now()
    AND (NOT material_change OR urgent_change_reason IS NOT NULL OR
      (notice_starts_at IS NOT NULL AND effective_at >= notice_starts_at + interval '30 days'))
  ORDER BY effective_at DESC, version DESC
  LIMIT 1;
  IF current_terms_id IS NULL THEN
    RETURN NEW;
  END IF;

  admission_parts := string_to_array(NEW.legal_registration_admission, '|');
  IF array_length(admission_parts, 1) <> 3 THEN
    RAISE EXCEPTION 'Current Terms agreement and age declaration are required.' USING ERRCODE = '42501';
  END IF;
  admission_flow := admission_parts[1];
  admission_token := admission_parts[2];
  admission_binding := admission_parts[3];
  IF admission_flow NOT IN ('email', 'google_native', 'google_browser')
    OR admission_binding IS NULL OR char_length(admission_binding) NOT BETWEEN 1 AND 4096
    OR (admission_flow <> 'google_browser' AND (admission_token IS NULL OR admission_token !~ '^[0-9a-f]{64}$'))
    OR (admission_flow = 'google_browser' AND admission_token <> '') THEN
    RAISE EXCEPTION 'Current Terms agreement and age declaration are required.' USING ERRCODE = '42501';
  END IF;

  SELECT ri.token_digest INTO consumed_digest
  FROM public.registration_intents ri
  JOIN public.legal_document_versions lv ON lv.id = ri.terms_version_id
  JOIN public.legal_document_contents lc ON lc.terms_version_id = lv.id
  WHERE ri.terms_version_id = current_terms_id
    AND ri.age_declaration_version = 'age-16-v1'
    AND ri.consumed_at IS NULL
    AND ri.expires_at > now()
    AND lv.content_digest = current_digest
    AND encode(digest(convert_to(lc.canonical_content, 'UTF8'), 'sha256'), 'hex') = lv.content_digest
    AND (
      (admission_flow IN ('email', 'google_native')
        AND ri.token_digest = encode(digest(convert_to(admission_token, 'UTF8'), 'sha256'), 'hex')
        AND ri.flow_binding_digest = encode(digest(convert_to(admission_flow || ':' || admission_binding, 'UTF8'), 'sha256'), 'hex'))
      OR (admission_flow = 'google_browser'
        AND ri.flow_binding_digest = encode(digest(convert_to('google_browser:' || admission_binding, 'UTF8'), 'sha256'), 'hex'))
    )
  FOR UPDATE OF ri;
  IF consumed_digest IS NULL THEN
    RAISE EXCEPTION 'Current Terms agreement and age declaration are required.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.registration_intents
  SET consumed_at = now()
  WHERE token_digest = consumed_digest AND consumed_at IS NULL
  RETURNING token_digest INTO consumed_digest;
  IF consumed_digest IS NULL THEN
    RAISE EXCEPTION 'Current Terms agreement and age declaration are required.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.terms_acceptances (user_id, terms_version_id)
  VALUES (NEW.id, current_terms_id)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.age_declarations (user_id, declaration_version)
  VALUES (NEW.id, 'age-16-v1')
  ON CONFLICT DO NOTHING;
  UPDATE public."user" SET legal_registration_admission = NULL WHERE id = NEW.id;
  RETURN NEW;
END;
$$;--> statement-breakpoint
