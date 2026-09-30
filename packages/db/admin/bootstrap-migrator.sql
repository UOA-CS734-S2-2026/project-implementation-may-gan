-- Run only while connected directly as migrator, after bootstrap-roles.sql succeeds.
-- PostgreSQL permits default-privilege changes only for the current role or a member role.
-- Rerunning is safe after an interrupted bootstrap.

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO app;

-- Cover public objects created by migrator before this file was first run.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO app;

-- Prompt versions are deployment data, not app-authored content.
DO $$
DECLARE
  restricted_table text;
BEGIN
  IF to_regclass('public.daily_prompts') IS NOT NULL THEN
    REVOKE INSERT ON TABLE public.daily_prompts FROM app;
  END IF;

  -- Reapplying bootstrap must not restore broad default DML to lifecycle data.
  IF to_regclass('public."user"') IS NOT NULL THEN
    REVOKE DELETE ON TABLE public."user" FROM app;
  END IF;

  FOREACH restricted_table IN ARRAY ARRAY[
    'account_lifecycles',
    'account_management_grants',
    'account_google_reauthentication_intents',
    'account_purge_receipts',
    'age_declarations',
    'data_export_requests',
    'data_export_object_cleanup_tasks',
    'legal_document_versions',
    'operator_cases',
    'registration_intents',
    'terms_acceptances'
  ] LOOP
    IF to_regclass('public.' || restricted_table) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM app, lifecycle_worker', restricted_table);
    END IF;
  END LOOP;

  IF to_regclass('public.account_lifecycles') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE public.account_lifecycles TO app;
    GRANT SELECT, INSERT, UPDATE ON TABLE public.account_management_grants TO app;
    GRANT SELECT, INSERT, UPDATE ON TABLE public.account_google_reauthentication_intents TO app;
    GRANT SELECT, INSERT, UPDATE ON TABLE public.data_export_requests TO app;
    GRANT SELECT, INSERT, UPDATE ON TABLE public.registration_intents TO app;
    GRANT SELECT, INSERT ON TABLE public.age_declarations TO app;
    GRANT SELECT, INSERT ON TABLE public.terms_acceptances TO app;
    GRANT SELECT ON TABLE public.legal_document_versions TO app;
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS drizzle AUTHORIZATION migrator;
ALTER SCHEMA drizzle OWNER TO migrator;
GRANT USAGE, CREATE ON SCHEMA drizzle TO migrator;
REVOKE ALL ON SCHEMA drizzle FROM PUBLIC, app;
REVOKE ALL ON ALL TABLES IN SCHEMA drizzle FROM PUBLIC, app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA drizzle FROM PUBLIC, app;
ALTER DEFAULT PRIVILEGES IN SCHEMA drizzle REVOKE ALL ON TABLES FROM PUBLIC, app;
ALTER DEFAULT PRIVILEGES IN SCHEMA drizzle REVOKE ALL ON SEQUENCES FROM PUBLIC, app;
