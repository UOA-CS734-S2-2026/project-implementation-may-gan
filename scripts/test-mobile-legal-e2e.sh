#!/usr/bin/env bash

# Runs the Android legal journey against a disposable local Better Auth Worker
# and PostgreSQL fixture. It uses the operator-installed mkcert development CA
# and an adb loopback reverse. It never contacts staging or production.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$repo_root/packages/db/docker-compose.yml"
compose_project="dayli-mobile-legal-e2e-${$}-${RANDOM}"
temporary_dir="$(mktemp -d "${TMPDIR:-/tmp}/dayli-mobile-legal-e2e.XXXXXX")"
api_log="$temporary_dir/api.log"
api_pid=""
reverse_created=false

device_id="${1:-emulator-5554}"
adb_bin="${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}/platform-tools/adb"
certificate="${XDG_STATE_HOME:-$HOME/.local/state}/dayli/mkcert/localhost.pem"
key="${XDG_STATE_HOME:-$HOME/.local/state}/dayli/mkcert/localhost-key.pem"

find_free_port() {
  node -e 'const server = require("node:net").createServer(); server.listen(0, "127.0.0.1", () => { console.log(server.address().port); server.close(); });'
}

postgres_port="$(find_free_port)"
api_port="$(find_free_port)"
api_origin="https://localhost:${api_port}"
export POSTGRES_PORT="$postgres_port"

stop_process_tree() {
  local pid="$1"
  local child

  [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1 || return 0
  while IFS= read -r child; do
    stop_process_tree "$child"
  done < <(pgrep -P "$pid" 2>/dev/null || true)
  kill "$pid" >/dev/null 2>&1 || true
  wait "$pid" >/dev/null 2>&1 || true
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  if [[ "$reverse_created" == true ]]; then
    "$adb_bin" -s "$device_id" reverse --remove "tcp:${api_port}" >/dev/null 2>&1 || true
  fi
  stop_process_tree "$api_pid"
  docker compose -p "$compose_project" -f "$compose_file" down -v --remove-orphans >/dev/null 2>&1 || true
  if [[ "$status" -ne 0 ]]; then
    echo 'API log:' >&2
    [[ -f "$api_log" ]] && tail -n 100 "$api_log" >&2 || true
  fi
  rm -rf "$temporary_dir"
  exit "$status"
}

trap cleanup EXIT INT TERM

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Android legal E2E requires $1." >&2
    exit 1
  fi
}

wait_for_url() {
  local url="$1"
  local pid="$2"
  local attempts=0
  until curl --fail --silent --insecure "$url" >/dev/null; do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      echo "API stopped before it became ready." >&2
      return 1
    fi
    attempts=$((attempts + 1))
    if [[ "$attempts" -ge 120 ]]; then
      echo "API did not become ready at $url." >&2
      return 1
    fi
    sleep 0.5
  done
}

require_command curl
require_command docker
require_command flutter
require_command mkcert
require_command node
require_command openssl
require_command pnpm
[[ -x "$adb_bin" ]] || { echo "Android legal E2E requires adb at $adb_bin." >&2; exit 1; }
[[ -r "$certificate" && -r "$key" ]] || {
  echo 'The existing local mkcert localhost certificate is required. Run the documented local HTTPS setup first.' >&2
  exit 1
}
root_ca="$(mkcert -CAROOT)/rootCA.pem"
[[ -r "$root_ca" ]] || { echo 'The mkcert rootCA.pem is required.' >&2; exit 1; }
openssl verify -CAfile "$root_ca" "$certificate" >/dev/null
"$adb_bin" -s "$device_id" get-state | grep -qx device

docker compose version >/dev/null
docker info >/dev/null

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
      --var "BETTER_AUTH_TRUSTED_ORIGINS:${api_origin}"
) >"$api_log" 2>&1 &
api_pid=$!
wait_for_url "${api_origin}/api/v1/health" "$api_pid"

"$adb_bin" -s "$device_id" reverse "tcp:${api_port}" "tcp:${api_port}"
reverse_created=true

echo 'Running Android Better Auth and legal journey'
ca_base64="$(base64 < "$root_ca" | tr -d '\n')"
(
  cd "$repo_root/apps/mobile"
  flutter test integration_test/legal_backend_integration_test.dart -d "$device_id" \
    --dart-define="DAYLI_E2E_API_BASE_URL=${api_origin}" \
    --dart-define="DAYLI_DEV_CA_PEM_B64=${ca_base64}"
)
