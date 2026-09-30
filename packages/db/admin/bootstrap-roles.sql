-- Run in Neon SQL Editor as neondb_owner.
-- This file creates roles and grants only. It must not configure migrator defaults.
-- Create the two SQL roles with separate passwords in Neon SQL Editor first.
-- This file grants their privileges and creates either role only if absent.
-- Never use a passwordless role for a live connection.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'migrator') THEN
    CREATE ROLE migrator LOGIN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app') THEN
    CREATE ROLE app LOGIN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lifecycle_worker') THEN
    CREATE ROLE lifecycle_worker LOGIN;
  END IF;

  EXECUTE format('GRANT CONNECT ON DATABASE %I TO migrator, app, lifecycle_worker', current_database());
  EXECUTE format('GRANT CREATE ON DATABASE %I TO migrator', current_database());
END
$$;

-- Do not rely on the implicit PUBLIC grant when restricting application DDL.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO migrator;
GRANT USAGE ON SCHEMA public TO app, lifecycle_worker;
REVOKE CREATE ON SCHEMA public FROM app, lifecycle_worker;
