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
BEGIN
  IF to_regclass('public.daily_prompts') IS NOT NULL THEN
    REVOKE INSERT ON TABLE public.daily_prompts FROM app;
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
