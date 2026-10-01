#!/usr/bin/env bash
set -Eeuo pipefail

psql --set ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set migrator_password="$MIGRATOR_DATABASE_PASSWORD" \
  --set app_password="$APP_DATABASE_PASSWORD" \
  --set lifecycle_worker_password="$LIFECYCLE_WORKER_DATABASE_PASSWORD" <<'SQL'
CREATE ROLE migrator LOGIN PASSWORD :'migrator_password';
CREATE ROLE app LOGIN PASSWORD :'app_password';
CREATE ROLE lifecycle_worker LOGIN PASSWORD :'lifecycle_worker_password';

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE dayli_dev TO migrator, app, lifecycle_worker;
GRANT CREATE ON DATABASE dayli_dev TO migrator;
GRANT USAGE, CREATE ON SCHEMA public TO migrator;
GRANT USAGE ON SCHEMA public TO app, lifecycle_worker;
REVOKE CREATE ON SCHEMA public FROM app, lifecycle_worker;

ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO app;

CREATE SCHEMA drizzle AUTHORIZATION migrator;
GRANT USAGE, CREATE ON SCHEMA drizzle TO migrator;
REVOKE ALL ON SCHEMA drizzle FROM PUBLIC, app;
SQL
