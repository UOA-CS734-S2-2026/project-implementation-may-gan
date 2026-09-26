-- Run in Neon SQL Editor as neondb_owner.
-- This file creates roles and grants only. It must not configure migrator defaults.
-- Leave roles without passwords. Live provisioning is deferred until a secure,
-- Neon-compatible first-password method is reviewed; psql \password is rejected.

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

-- Do not rely on the implicit PUBLIC grant when restricting application DDL.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO migrator;
GRANT USAGE ON SCHEMA public TO app, users_accounts_importer;
REVOKE CREATE ON SCHEMA public FROM app, users_accounts_importer;
