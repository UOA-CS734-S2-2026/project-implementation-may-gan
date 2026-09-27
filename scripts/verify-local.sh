#!/usr/bin/env bash

# Run the paused hosted verification suite against an isolated local PostgreSQL fixture.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$repo_root/packages/db/docker-compose.yml"
compose_project="dayli-verify-local-$$"
local_database_url="postgresql://migrator:migrator@localhost:5433/dayli_test"
relationship_database_url="postgresql://migrator:migrator@localhost:5433/dayli_relationship_test"
temporary_dir="$(mktemp -d "${TMPDIR:-/tmp}/dayli-verify-local.XXXXXX")"

cleanup() {
  local status=$?
  docker compose -p "$compose_project" -f "$compose_file" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$temporary_dir"
  exit "$status"
}

trap cleanup EXIT INT TERM

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "verify:local requires $1." >&2
    exit 1
  fi
}

cd "$repo_root"

require_command node
if [[ "$(node -p 'process.versions.node.split(".")[0]')" != "24" ]]; then
  echo "verify:local requires Node.js 24." >&2
  exit 1
fi

require_command pnpm
expected_pnpm="$(node -p 'require("./package.json").packageManager.split("@").at(-1)')"
if [[ "$(pnpm --version)" != "$expected_pnpm" ]]; then
  echo "verify:local requires pnpm $expected_pnpm." >&2
  exit 1
fi

require_command flutter
require_command dart
require_command java
require_command javac
javac_version="$(javac -version 2>&1)"
if [[ ! "$javac_version" =~ (^|[^0-9])17([.[:space:]]|$) ]]; then
  echo "verify:local requires JDK 17, found: $javac_version" >&2
  exit 1
fi

require_command docker
docker compose version >/dev/null
docker info >/dev/null

printf 'Using Node %s, pnpm %s, %s\n' "$(node --version)" "$(pnpm --version)" "$javac_version"
flutter --version

echo 'Installing workspace dependencies'
pnpm install --frozen-lockfile

echo 'Running TypeScript verification'
pnpm lint
pnpm --filter @dayli/web exec next typegen
pnpm typecheck
node --test scripts/staging-origins.test.mjs scripts/staging-auth-bindings.test.mjs
pnpm test
pnpm build

echo 'Checking generated API clients'
pnpm generate:clients:check

echo 'Running Dart generated-client checks'
(
  cd packages/api-client-dart
  dart pub get
  dart analyze
  dart test
)

echo 'Running Flutter checks'
(
  cd apps/mobile
  flutter pub get --enforce-lockfile
  dart format --output=none --set-exit-if-changed .
  flutter analyze
  flutter test
  if [[ "${VERIFY_LOCAL_FULL:-0}" == "1" ]]; then
    flutter build apk --debug
  fi
)

echo 'Starting isolated PostgreSQL fixture'
export COMPOSE_PROJECT_NAME="$compose_project"
docker compose -p "$compose_project" -f "$compose_file" up -d --wait

echo 'Provisioning isolated relationship test database'
docker compose -p "$compose_project" -f "$compose_file" exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U postgres -d postgres -c 'CREATE DATABASE dayli_relationship_test OWNER migrator;'
docker compose -p "$compose_project" -f "$compose_file" exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U postgres -d dayli_relationship_test <<'SQL'
GRANT USAGE, CREATE ON SCHEMA public TO migrator;
GRANT USAGE ON SCHEMA public TO app;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO app;
CREATE SCHEMA drizzle AUTHORIZATION migrator;
GRANT USAGE, CREATE ON SCHEMA drizzle TO migrator;
REVOKE ALL ON SCHEMA drizzle FROM app;
SQL

echo 'Running PostgreSQL migration and integration checks'
export MIGRATION_TARGET=local
export DATABASE_URL="$local_database_url"
export TEST_DATABASE_URL="$local_database_url"
export TEST_APP_DATABASE_URL="postgresql://app:app@localhost:5433/dayli_test"
export RELATIONSHIP_TEST_DATABASE_URL="$relationship_database_url"
export PERMISSIONS_POSTGRES_TEST=1
export POSTS_POSTGRES_TEST=1
pnpm db:check
pnpm db:migrate
DATABASE_URL="$relationship_database_url" pnpm db:migrate
pnpm db:verify
pnpm db:migrate
DATABASE_URL="$relationship_database_url" pnpm db:migrate
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

echo 'Local verification passed.'
