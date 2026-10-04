#!/usr/bin/env bash

# Runs DPP-004 native journeys against a disposable Worker and PostgreSQL.
# It requires an already-running Android emulator and never uses staging data.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$repo_root/packages/db/docker-compose.yml"
compose_project="dayli-mobile-dpp004-${$}-${RANDOM}"
temporary_dir="$(mktemp -d "${TMPDIR:-/tmp}/dayli-mobile-dpp004.XXXXXX")"
api_log="$temporary_dir/api.log"
media_log="$temporary_dir/media.log"
api_pid=""
media_pid=""

find_free_port() {
  node -e 'const server = require("node:net").createServer(); server.listen(0, "127.0.0.1", () => { console.log(server.address().port); server.close(); });'
}

postgres_port="$(find_free_port)"
api_port="$(find_free_port)"
media_port="$(find_free_port)"
host_api_origin="https://localhost:${api_port}"
device_api_origin="https://10.0.2.2:${api_port}"
device_id="${DPP004_DEVICE_ID:-}"
suffix="$(openssl rand -hex 6)"
public_username="dpp_public_${suffix}"
private_username="dpp_private_${suffix}"
viewer_username="dpp_viewer_${suffix}"
second_viewer_username="dpp_viewer_two_${suffix}"
public_email="${public_username}@example.test"
private_email="${private_username}@example.test"
viewer_email="${viewer_username}@example.test"
second_viewer_email="${second_viewer_username}@example.test"
viewer_password="$(openssl rand -hex 18)"
second_viewer_password="$(openssl rand -hex 18)"
fixture_password="$(openssl rand -hex 18)"
public_post_id="dpp-post-${suffix}"
public_media_id="dpp-media-${suffix}"
private_post_id="dpp-private-post-${suffix}"
certificate="$temporary_dir/fixture.pem"
key="$temporary_dir/fixture-key.pem"
defines="$temporary_dir/flutter-defines.json"
export POSTGRES_PORT="$postgres_port"

stop_process() {
  local pid="$1"
  local child
  local attempts=0
  [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1 || return
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do stop_process "$child"; done
  kill "$pid" >/dev/null 2>&1 || true
  while kill -0 "$pid" >/dev/null 2>&1 && [[ "$attempts" -lt 20 ]]; do
    sleep 0.5
    attempts=$((attempts + 1))
  done
  if kill -0 "$pid" >/dev/null 2>&1; then kill -9 "$pid" >/dev/null 2>&1 || true; fi
  wait "$pid" >/dev/null 2>&1 || true
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  stop_process "$api_pid"
  stop_process "$media_pid"
  docker compose -p "$compose_project" -f "$compose_file" down -v --remove-orphans >/dev/null 2>&1 || true
  if [[ "$status" -ne 0 ]]; then
    echo 'Disposable API log:' >&2
    [[ -f "$api_log" ]] && tail -n 100 "$api_log" >&2 || true
  fi
  rm -rf "$temporary_dir"
  exit "$status"
}
trap cleanup EXIT INT TERM

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "DPP-004 integration requires $1." >&2
    exit 1
  fi
}

wait_for_url() {
  local attempts=0
  until curl --fail --silent --insecure "${host_api_origin}/api/v1/health" >/dev/null; do
    if ! kill -0 "$api_pid" >/dev/null 2>&1; then
      echo 'Disposable API stopped before it became ready.' >&2
      return 1
    fi
    attempts=$((attempts + 1))
    if [[ "$attempts" -ge 120 ]]; then
      echo 'Disposable API did not become ready.' >&2
      return 1
    fi
    sleep 0.5
  done
}

sign_in() {
  local email="$1"
  local password="$2"
  local fixture_ip="$3"
  local key="$4"
  local headers="$temporary_dir/${key}-sign-in.headers"
  local body="$temporary_dir/${key}-sign-in.json"
  local status
  status="$(curl --silent --show-error --insecure \
    --dump-header "$headers" --output "$body" --write-out '%{http_code}' \
    --request POST "${host_api_origin}/api/auth/sign-in/email" \
    --header 'content-type: application/json' \
    --header "cf-connecting-ip: ${fixture_ip}" \
    --data "{\"email\":\"${email}\",\"password\":\"${password}\"}")"
  if [[ "$status" != "200" ]]; then
    echo "Synthetic sign-in failed with HTTP ${status}." >&2
    return 1
  fi
  awk 'BEGIN { IGNORECASE=1 } /^set-auth-token:/ { gsub("\\r", "", $2); print $2; exit }' "$headers"
}

sign_up() {
  local username="$1"
  local email="$2"
  local password="$3"
  local fixture_ip="$4"
  local headers="$temporary_dir/${username}.headers"
  local body="$temporary_dir/${username}.json"
  local status
  status="$(curl --silent --show-error --insecure \
    --dump-header "$headers" --output "$body" --write-out '%{http_code}' \
    --request POST "${host_api_origin}/api/auth/sign-up/email" \
    --header 'content-type: application/json' \
    --header "cf-connecting-ip: ${fixture_ip}" \
    --data "{\"name\":\"Synthetic ${username}\",\"username\":\"${username}\",\"displayUsername\":\"Synthetic ${username}\",\"email\":\"${email}\",\"password\":\"${password}\"}")"
  if [[ "$status" != "200" ]]; then
    echo "Synthetic account setup failed with HTTP ${status}." >&2
    return 1
  fi
  awk 'BEGIN { IGNORECASE=1 } /^set-auth-token:/ { gsub("\\r", "", $2); print $2; exit }' "$headers"
}

require_command curl
require_command docker
require_command flutter
require_command node
require_command openssl
require_command pnpm
if [[ -z "$device_id" ]]; then
  echo 'Set DPP004_DEVICE_ID to an already-running Android emulator.' >&2
  exit 1
fi
if ! flutter devices --machine | node -e '
  let value=""; process.stdin.on("data", c => value += c); process.stdin.on("end", () => {
    const id = process.argv[1];
    const devices = JSON.parse(value);
    process.exit(devices.some(device => device.id === id && device.targetPlatform.startsWith("android")) ? 0 : 1);
  });
' "$device_id"; then
  echo 'DPP004_DEVICE_ID is not an available Android emulator.' >&2
  exit 1
fi

docker compose version >/dev/null
docker info >/dev/null

openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 1 \
  -keyout "$key" -out "$certificate" -subj '/CN=dayli-dpp004-fixture' \
  -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:10.0.2.2' >/dev/null 2>&1

mkdir -p "$temporary_dir/media"
node "$repo_root/scripts/fixtures/local-s3-media-server.mjs" \
  "$temporary_dir/media" "$media_port" >"$media_log" 2>&1 &
media_pid=$!
for _ in $(seq 1 40); do
  if curl --fail --silent "http://127.0.0.1:${media_port}/health" >/dev/null; then break; fi
  sleep 0.1
done
if ! curl --fail --silent "http://127.0.0.1:${media_port}/health" >/dev/null; then
  echo 'Disposable media fixture did not become ready.' >&2
  exit 1
fi

cd "$repo_root"
echo 'Starting disposable DPP-004 PostgreSQL fixture'
docker compose -p "$compose_project" -f "$compose_file" up -d --wait

echo 'Applying migrations to the disposable fixture'
LOCAL_TEST_POSTGRES_PORT="$postgres_port" \
  MIGRATION_TARGET=local \
  DATABASE_URL="postgresql://migrator:migrator@localhost:${postgres_port}/dayli_test" \
  pnpm db:migrate >/dev/null

echo 'Starting disposable local Worker'
(
  exec env \
    CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="postgresql://app:app@localhost:${postgres_port}/dayli_test" \
    pnpm --filter @dayli/api exec wrangler dev \
      --cwd "$temporary_dir" \
      --config "$repo_root/apps/api/wrangler.local.example.jsonc" \
      --local --ip 0.0.0.0 --port "$api_port" --local-protocol https \
      --https-key-path "$key" --https-cert-path "$certificate" \
      --persist-to "$temporary_dir/wrangler" --log-level warn \
      --var 'BETTER_AUTH_SECRET:dpp004-disposable-secret-at-least-32-characters' \
      --var "BETTER_AUTH_BASE_URL:${device_api_origin}" \
      --var "BETTER_AUTH_TRUSTED_ORIGINS:${device_api_origin},${host_api_origin}" \
      --var 'R2_ACCOUNT_ID:local-e2e' \
      --var 'R2_BUCKET_NAME:dayli-media-local' \
      --var 'R2_ACCESS_KEY_ID:local-access-key' \
      --var 'R2_SECRET_ACCESS_KEY:local-secret-key' \
      --var "R2_LOCAL_ENDPOINT:http://127.0.0.1:${media_port}"
) >"$api_log" 2>&1 &
api_pid=$!
wait_for_url

echo 'Creating disposable synthetic accounts'
public_token="$(sign_up "$public_username" "$public_email" "$fixture_password" '198.51.100.11')"
private_token="$(sign_up "$private_username" "$private_email" "$fixture_password" '198.51.100.12')"
viewer_token="$(sign_up "$viewer_username" "$viewer_email" "$viewer_password" '198.51.100.13')"
second_viewer_token="$(sign_up "$second_viewer_username" "$second_viewer_email" "$second_viewer_password" '198.51.100.14')"
if [[ -z "$public_token" || -z "$private_token" || -z "$viewer_token" || -z "$second_viewer_token" ]]; then
  echo 'Synthetic account setup returned no native session token.' >&2
  exit 1
fi

private_status="$(curl --silent --show-error --insecure --output "$temporary_dir/private-update.json" --write-out '%{http_code}' \
  --request PATCH "${host_api_origin}/api/v1/profile" \
  --header 'content-type: application/json' \
  --header "authorization: Bearer ${private_token}" \
  --data '{"profileVisibility":"private"}')"
if [[ "$private_status" != "200" ]]; then
  echo "Synthetic private-profile setup failed with HTTP ${private_status}." >&2
  exit 1
fi

public_user_id="$(docker compose -p "$compose_project" -f "$compose_file" exec -T postgres \
  psql -At -U postgres -d dayli_test -c "select id from public.\"user\" where email = '${public_email}'")"
private_user_id="$(docker compose -p "$compose_project" -f "$compose_file" exec -T postgres \
  psql -At -U postgres -d dayli_test -c "select id from public.\"user\" where email = '${private_email}'")"
viewer_user_id="$(docker compose -p "$compose_project" -f "$compose_file" exec -T postgres \
  psql -At -U postgres -d dayli_test -c "select id from public.\"user\" where email = '${viewer_email}'")"
if [[ -z "$public_user_id" || -z "$private_user_id" || -z "$viewer_user_id" ]]; then
  echo 'Synthetic accounts were not persisted.' >&2
  exit 1
fi

public_media_key="media/${public_user_id}/${public_media_id}.png"
public_media_path="$temporary_dir/media/dayli-media-local/$public_media_key"
mkdir -p "$(dirname "$public_media_path")"
node -e 'require("node:fs").writeFileSync(process.argv[1], Buffer.from(process.argv[2], "base64"))' \
  "$public_media_path" \
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
public_media_size="$(wc -c < "$public_media_path" | tr -d ' ')"

docker compose -p "$compose_project" -f "$compose_file" exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U postgres -d dayli_test \
    -v author_id="$public_user_id" -v post_id="$public_post_id" \
    -v media_id="$public_media_id" -v media_key="$public_media_key" \
    -v media_size="$public_media_size" \
    -v private_author_id="$private_user_id" -v private_post_id="$private_post_id" \
    -v blocked_id="$viewer_user_id" >/dev/null <<'SQL'
INSERT INTO public.posts
  (id, author_id, local_date, prompt_id, reflective_answer, rating, audience, accepted_at, released_at)
VALUES
  (:'post_id', :'author_id', '2026-09-29', 'prompt-09-29', 'Synthetic released dayli.', 8,
   'friends', '2026-09-29T03:00:00Z', '2026-09-29T11:00:00Z'),
  (:'private_post_id', :'private_author_id', '2026-09-28', 'prompt-09-28', 'Blocked private dayli.', 6,
   'friends', '2026-09-28T03:00:00Z', '2026-09-28T11:00:00Z');
INSERT INTO public.media_reservation
  (id, owner_id, object_key, content_type, byte_size, status, validated_at, expires_at)
VALUES
  (:'media_id', :'author_id', :'media_key', 'image/png', :'media_size', 'validated', now(), now() + interval '1 day');
INSERT INTO public.post_media (id, post_id, attachment_order, reservation_id)
VALUES (:'media_id', :'post_id', 0, :'media_id');
INSERT INTO public.relationship_blocks (blocker_id, blocked_id, blocked_at)
VALUES (:'private_author_id', :'blocked_id', now());
DELETE FROM public.session WHERE user_id = :'author_id';
SQL

author_token="$(sign_in "$public_email" "$fixture_password" '198.51.100.15' 'author')"
if [[ -z "$author_token" ]]; then
  echo 'Synthetic author sign-in returned no native session token.' >&2
  exit 1
fi

export DPP004_API_BASE_URL="$device_api_origin"
export DPP004_PUBLIC_USERNAME="$public_username"
export DPP004_PRIVATE_USERNAME="$private_username"
export DPP004_PUBLIC_POST_ID="$public_post_id"
export DPP004_PRIVATE_POST_ID="$private_post_id"
export DPP004_AUTHOR_TOKEN="$author_token"
export DPP004_VIEWER_EMAIL="$viewer_email"
export DPP004_VIEWER_PASSWORD="$viewer_password"
export DPP004_VIEWER_TOKEN="$viewer_token"
export DPP004_EXPIRED_TOKEN="$public_token"
export DPP004_SECOND_VIEWER_TOKEN="$second_viewer_token"
export DPP004_CA_PEM_B64="$(base64 < "$certificate" | tr -d '\n')"
node >"$defines" <<'NODE'
const fs = require('node:fs');
const keys = [
  'DPP004_API_BASE_URL',
  'DPP004_PUBLIC_USERNAME',
  'DPP004_PRIVATE_USERNAME',
  'DPP004_PUBLIC_POST_ID',
  'DPP004_PRIVATE_POST_ID',
  'DPP004_AUTHOR_TOKEN',
  'DPP004_VIEWER_EMAIL',
  'DPP004_VIEWER_PASSWORD',
  'DPP004_VIEWER_TOKEN',
  'DPP004_EXPIRED_TOKEN',
  'DPP004_SECOND_VIEWER_TOKEN',
  'DPP004_CA_PEM_B64',
];
fs.writeFileSync(1, JSON.stringify(Object.fromEntries(keys.map(key => [key, process.env[key]]))));
NODE

echo 'Running DPP-004 journeys on the Android emulator'
cd "$repo_root/apps/mobile"
flutter test integration_test/public_profiles_real_test.dart \
  -d "$device_id" --dart-define-from-file="$defines"

echo 'DPP-004 disposable native integration passed and fixture cleanup will now run.'
