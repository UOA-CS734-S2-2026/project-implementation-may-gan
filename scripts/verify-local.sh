#!/usr/bin/env bash

# Run the paused hosted verification suite against an isolated local PostgreSQL fixture.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

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
node --test scripts/staging-origins.test.mjs scripts/staging-auth-bindings.test.mjs scripts/staging-media-bindings.test.mjs scripts/staging-auth-smoke.test.mjs
env -u TEST_DATABASE_URL -u TEST_APP_DATABASE_URL -u TEST_LIFECYCLE_DATABASE_URL -u TEST_LIFECYCLE_APP_DATABASE_URL -u TEST_LIFECYCLE_WORKER_DATABASE_URL -u TEST_PRIVACY_PREFLIGHT_DATABASE_URL -u VERIFY_POSTGRES_PORT -u LOCAL_TEST_POSTGRES_PORT pnpm test
pnpm --filter @dayli/api test:proxy-integration
pnpm test:proxy-provenance
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

VERIFY_POSTGRES_PROJECT="dayli-verify-local-$$" bash "$repo_root/scripts/verify-postgres.sh"

echo 'Local verification passed.'
