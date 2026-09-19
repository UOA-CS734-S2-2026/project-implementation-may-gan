-- Administrator-run role bootstrap for each Neon branch.
-- Run separately on production and staging as a Neon project owner/admin.
-- Set passwords outside this file; never commit role passwords or connection strings.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'migrator') THEN
    CREATE ROLE migrator LOGIN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app') THEN
    CREATE ROLE app LOGIN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'users_accounts_importer') THEN
    CREATE ROLE users_accounts_importer LOGIN;
  END IF;

  EXECUTE format('GRANT CONNECT ON DATABASE %I TO migrator, app, users_accounts_importer', current_database());
  EXECUTE format('GRANT CREATE ON DATABASE %I TO migrator', current_database());
END
$$;

GRANT USAGE, CREATE ON SCHEMA public TO migrator;
GRANT USAGE ON SCHEMA public TO app, users_accounts_importer;

ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO app;

-- This protected import role is intentionally not included in app default grants.
-- It receives only the user and account transfer rights after the target tables exist.
DO $$
BEGIN
  IF to_regclass('public.user') IS NOT NULL AND to_regclass('public.account') IS NOT NULL THEN
    GRANT SELECT, INSERT ON TABLE public."user", public.account TO users_accounts_importer;
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS drizzle AUTHORIZATION migrator;
ALTER SCHEMA drizzle OWNER TO migrator;
GRANT USAGE, CREATE ON SCHEMA drizzle TO migrator;
REVOKE ALL ON SCHEMA drizzle FROM app;
REVOKE ALL ON ALL TABLES IN SCHEMA drizzle FROM app;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA drizzle REVOKE ALL ON TABLES FROM app;

REVOKE CREATE ON SCHEMA public FROM app;
