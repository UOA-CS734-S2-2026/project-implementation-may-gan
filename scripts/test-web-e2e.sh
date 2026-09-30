#!/usr/bin/env bash

# Runs browser journeys against local HTTPS services and a disposable PostgreSQL
# Compose project. It does not use developer, staging, or production credentials.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$repo_root/packages/db/docker-compose.yml"
compose_project="dayli-web-e2e-${$}-${RANDOM}"
temporary_dir="$(mktemp -d "${TMPDIR:-/tmp}/dayli-web-e2e.XXXXXX")"
certificate="$temporary_dir/localhost.pem"
key="$temporary_dir/localhost-key.pem"
api_log="$temporary_dir/api.log"
web_log="$temporary_dir/web.log"
api_pid=""
web_pid=""

find_free_port() {
  node -e 'const server = require("node:net").createServer(); server.listen(0, "127.0.0.1", () => { console.log(server.address().port); server.close(); });'
}

postgres_port="$(find_free_port)"
api_port="$(find_free_port)"
web_port="$(find_free_port)"
api_origin="https://localhost:${api_port}"
web_origin="https://localhost:${web_port}"
export POSTGRES_PORT="$postgres_port"

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  for pid in "$web_pid" "$api_pid"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
      wait "$pid" >/dev/null 2>&1 || true
    fi
  done
  docker compose -p "$compose_project" -f "$compose_file" down -v --remove-orphans >/dev/null 2>&1 || true
  if [[ "$status" -ne 0 ]]; then
    echo 'API log:' >&2
    [[ -f "$api_log" ]] && tail -n 100 "$api_log" >&2 || true
    echo 'Web log:' >&2
    [[ -f "$web_log" ]] && tail -n 100 "$web_log" >&2 || true
  fi
  rm -rf "$temporary_dir"
  exit "$status"
}

trap cleanup EXIT INT TERM

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Web E2E tests require $1." >&2
    exit 1
  fi
}

wait_for_url() {
  local url="$1"
  local pid="$2"
  local name="$3"
  local attempts=0
  until curl --fail --silent --insecure "$url" >/dev/null; do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      echo "$name stopped before it became ready." >&2
      return 1
    fi
    attempts=$((attempts + 1))
    if [[ "$attempts" -ge 120 ]]; then
      echo "$name did not become ready at $url." >&2
      return 1
    fi
    sleep 0.5
  done
}

require_command curl
require_command docker
require_command openssl
require_command pnpm
require_command node
docker compose version >/dev/null
docker info >/dev/null

openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 1 \
  -keyout "$key" -out "$certificate" -subj '/CN=localhost' \
  -addext 'subjectAltName=DNS:localhost' >/dev/null 2>&1

cd "$repo_root"
echo 'Starting disposable PostgreSQL fixture'
docker compose -p "$compose_project" -f "$compose_file" up -d --wait

echo 'Applying migrations to the disposable database'
LOCAL_TEST_POSTGRES_PORT="$postgres_port" \
  MIGRATION_TARGET=local \
  DATABASE_URL="postgresql://migrator:migrator@localhost:${postgres_port}/dayli_test" \
  pnpm db:migrate

echo 'Starting isolated local API'
(
  exec env \
    CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="postgresql://app:app@localhost:${postgres_port}/dayli_test" \
    pnpm --filter @dayli/api exec wrangler dev \
      --cwd "$temporary_dir" \
      --config "$repo_root/apps/api/wrangler.local.example.jsonc" \
      --local --ip 127.0.0.1 --port "$api_port" --local-protocol https \
      --https-key-path "$key" --https-cert-path "$certificate" \
      --persist-to "$temporary_dir/wrangler" --log-level warn \
      --var 'BETTER_AUTH_SECRET:e2e-only-secret-that-is-at-least-32-characters' \
      --var "BETTER_AUTH_BASE_URL:${api_origin}" \
      --var "BETTER_AUTH_TRUSTED_ORIGINS:${api_origin},${web_origin}"
) >"$api_log" 2>&1 &
api_pid=$!
wait_for_url "${api_origin}/api/v1/health" "$api_pid" 'API'

echo 'Starting local web application'
(
  exec env \
    NEXT_PUBLIC_API_BASE_URL="$api_origin" \
    NEXT_TELEMETRY_DISABLED=1 \
    pnpm --filter @dayli/web exec next dev --webpack --hostname localhost --port "$web_port" \
      --experimental-https --experimental-https-key "$key" --experimental-https-cert "$certificate"
) >"$web_log" 2>&1 &
web_pid=$!
wait_for_url "$web_origin" "$web_pid" 'Web application'

echo 'Running Playwright browser journeys'
E2E_WEB_ORIGIN="$web_origin" pnpm --filter @dayli/web test:e2e
