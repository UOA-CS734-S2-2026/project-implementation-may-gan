#!/usr/bin/env bash

# Run the disposable PostgreSQL migration and integration suite used by local
# verification and GitHub Actions. It never addresses the persistent local
# development Compose project or volume.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$repo_root/packages/db/docker-compose.yml"
compose_project="${VERIFY_POSTGRES_PROJECT:-dayli-verify-postgres-$$}"
postgres_port="${VERIFY_POSTGRES_PORT:-5433}"
export POSTGRES_PORT="$postgres_port"
export LOCAL_TEST_POSTGRES_PORT="$postgres_port"
temporary_dir="$(mktemp -d "${TMPDIR:-/tmp}/dayli-verify-postgres.XXXXXX")"
main_database="dayli_test"
relationship_database="dayli_relationship_test"
messaging_database="dayli_messaging_test"
advisory_lock_database="dayli_advisory_lock_ci_test"
lifecycle_database="dayli_lifecycle_test"
auth_database="dayli_auth_test"

# The test Compose file and integration guards read these values when a verifier
# needs an isolated port.
export POSTGRES_PORT="$postgres_port"
export VERIFY_POSTGRES_PORT="$postgres_port"

cleanup() {
  local status=$?
  docker compose -p "$compose_project" -f "$compose_file" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$temporary_dir"
  exit "$status"
}

trap cleanup EXIT INT TERM

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "PostgreSQL verification requires $1." >&2
    exit 1
  fi
}

migrator_url() {
  local database_name="$1"
  printf 'postgresql://migrator:migrator@localhost:%s/%s' "$postgres_port" "$database_name"
}

app_url() {
  local database_name="$1"
  printf 'postgresql://app:app@localhost:%s/%s' "$postgres_port" "$database_name"
}

# Signature for future isolated integration suites: provision_isolated_database <database_name>
provision_isolated_database() {
  local database_name="$1"
  if [[ ! "$database_name" =~ ^dayli_[a-z0-9_]+_test$ ]]; then
    echo "Refusing unsafe isolated database name." >&2
    exit 1
  fi

  docker compose -p "$compose_project" -f "$compose_file" exec -T postgres \
    psql -v ON_ERROR_STOP=1 -U postgres -d postgres -v database_name="$database_name" <<'SQL'
SELECT format('CREATE DATABASE %I OWNER migrator', :'database_name')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'database_name')
\gexec
SQL
  docker compose -p "$compose_project" -f "$compose_file" exec -T postgres \
    psql -v ON_ERROR_STOP=1 -U postgres -d "$database_name" <<'SQL'
GRANT USAGE, CREATE ON SCHEMA public TO migrator;
GRANT USAGE ON SCHEMA public TO app;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO app;
CREATE SCHEMA IF NOT EXISTS drizzle AUTHORIZATION migrator;
GRANT USAGE, CREATE ON SCHEMA drizzle TO migrator;
REVOKE ALL ON SCHEMA drizzle FROM app;
SQL
}

cd "$repo_root"
require_command docker
docker compose version >/dev/null
docker info >/dev/null

echo 'Starting isolated PostgreSQL fixture'
docker compose -p "$compose_project" -f "$compose_file" up -d --wait

echo 'Provisioning isolated relationship test database'
provision_isolated_database "$relationship_database"
echo 'Provisioning isolated messaging test database'
provision_isolated_database "$messaging_database"
echo 'Provisioning isolated advisory-lock test database'
provision_isolated_database "$advisory_lock_database"
echo 'Provisioning isolated lifecycle test database'
provision_isolated_database "$lifecycle_database"
echo 'Provisioning isolated auth test database'
provision_isolated_database "$auth_database"

# Future suites may request additional disposable databases without sharing a
# volume or credential with development. Comma-separated names only.
additional_databases=()
if [[ -n "${ADDITIONAL_ISOLATED_DATABASES:-}" ]]; then
  IFS=',' read -r -a additional_databases <<< "$ADDITIONAL_ISOLATED_DATABASES"
  for database_name in "${additional_databases[@]}"; do
    provision_isolated_database "$database_name"
  done
fi

echo 'Running PostgreSQL migration and integration checks'
export MIGRATION_TARGET=local
export DATABASE_URL="$(migrator_url "$main_database")"
export TEST_DATABASE_URL="$DATABASE_URL"
export TEST_APP_DATABASE_URL="$(app_url "$main_database")"
export RELATIONSHIP_TEST_DATABASE_URL="$(migrator_url "$relationship_database")"
export MESSAGING_TEST_DATABASE_URL="$(migrator_url "$messaging_database")"
export MESSAGING_DELIVERY_TEST_DATABASE_URL="$MESSAGING_TEST_DATABASE_URL"
export ADVISORY_LOCK_TEST_DATABASE_URL="$(app_url "$advisory_lock_database")"
export ADVISORY_LOCK_TEST_MIGRATOR_DATABASE_URL="$(migrator_url "$advisory_lock_database")"
export LIFECYCLE_TEST_DATABASE_URL="$(migrator_url "$lifecycle_database")"
export LIFECYCLE_TEST_APP_DATABASE_URL="$(app_url "$lifecycle_database")"
export LIFECYCLE_TEST_WORKER_DATABASE_URL="postgresql://lifecycle_worker:lifecycle_worker@localhost:${postgres_port}/${lifecycle_database}"
export AUTH_TEST_DATABASE_URL="$(migrator_url "$auth_database")"
export AUTH_TEST_APP_DATABASE_URL="$(app_url "$auth_database")"
export PERMISSIONS_POSTGRES_TEST=1
export POSTS_POSTGRES_TEST=1
pnpm db:check
pnpm db:migrate
DATABASE_URL="$RELATIONSHIP_TEST_DATABASE_URL" pnpm db:migrate
DATABASE_URL="$MESSAGING_TEST_DATABASE_URL" pnpm db:migrate
DATABASE_URL="$ADVISORY_LOCK_TEST_MIGRATOR_DATABASE_URL" pnpm db:migrate
DATABASE_URL="$LIFECYCLE_TEST_DATABASE_URL" pnpm db:migrate
DATABASE_URL="$AUTH_TEST_DATABASE_URL" pnpm db:migrate
if [[ ${#additional_databases[@]} -gt 0 ]]; then
  for database_name in "${additional_databases[@]}"; do
    DATABASE_URL="$(migrator_url "$database_name")" pnpm db:migrate
  done
fi
pnpm db:verify
pnpm db:migrate
DATABASE_URL="$RELATIONSHIP_TEST_DATABASE_URL" pnpm db:migrate
DATABASE_URL="$MESSAGING_TEST_DATABASE_URL" pnpm db:migrate
DATABASE_URL="$ADVISORY_LOCK_TEST_MIGRATOR_DATABASE_URL" pnpm db:migrate
DATABASE_URL="$LIFECYCLE_TEST_DATABASE_URL" pnpm db:migrate
DATABASE_URL="$AUTH_TEST_DATABASE_URL" pnpm db:migrate
if [[ ${#additional_databases[@]} -gt 0 ]]; then
  for database_name in "${additional_databases[@]}"; do
    DATABASE_URL="$(migrator_url "$database_name")" pnpm db:migrate
  done
fi
pnpm db:test

if env -u DATABASE_URL pnpm db:verify >"$temporary_dir/missing.out" 2>&1; then
  echo 'db:verify unexpectedly succeeded without DATABASE_URL' >&2
  exit 1
fi
if grep -E 'postgresql://|migrator:migrator|app:app|localhost' "$temporary_dir/missing.out"; then
  echo 'Credential material leaked in missing-credential output' >&2
  exit 1
fi
if DATABASE_URL='not-a-url' pnpm db:verify >"$temporary_dir/invalid.out" 2>&1; then
  echo 'db:verify unexpectedly succeeded with invalid DATABASE_URL' >&2
  exit 1
fi
if grep -E 'postgresql://|migrator:migrator|app:app|localhost' "$temporary_dir/invalid.out"; then
  echo 'Credential material leaked in invalid-credential output' >&2
  exit 1
fi

echo 'PostgreSQL verification passed.'
