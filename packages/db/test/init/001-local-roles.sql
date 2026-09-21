CREATE ROLE migrator LOGIN PASSWORD 'migrator';
CREATE ROLE app LOGIN PASSWORD 'app';
CREATE ROLE users_accounts_importer LOGIN PASSWORD 'users_accounts_importer';
CREATE ROLE legacy_users_accounts_reader NOLOGIN;
GRANT legacy_users_accounts_reader TO migrator;

GRANT CONNECT ON DATABASE dayli_test TO migrator, app, users_accounts_importer;
GRANT CREATE ON DATABASE dayli_test TO migrator;
GRANT USAGE, CREATE ON SCHEMA public TO migrator;
GRANT USAGE ON SCHEMA public TO app, users_accounts_importer;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO app;
REVOKE CREATE ON SCHEMA public FROM app;

CREATE SCHEMA drizzle AUTHORIZATION migrator;
GRANT USAGE, CREATE ON SCHEMA drizzle TO migrator;
REVOKE ALL ON SCHEMA drizzle FROM app;
