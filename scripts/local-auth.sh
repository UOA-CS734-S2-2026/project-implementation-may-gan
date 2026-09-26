#!/usr/bin/env bash

# Local HTTPS launch helpers. They never install a CA and never write a secret
# into Git-tracked files.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
state_dir="${XDG_STATE_HOME:-$HOME/.local/state}/dayli"
cert_dir="$state_dir/mkcert"
certificate="$cert_dir/localhost.pem"
key="$cert_dir/localhost-key.pem"
credentials_file="$state_dir/development-postgres.env"
api_vars="$repo_root/apps/api/.dev.vars"
api_config="$repo_root/apps/api/wrangler.local.jsonc"
api_config_template="$repo_root/apps/api/wrangler.local.example.jsonc"
web_env="$repo_root/apps/web/.env.local"
api_origin="https://localhost:8787"
web_origin="https://localhost:3000"
trusted_origins="$api_origin,$web_origin"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Local HTTPS authentication requires $1." >&2
    exit 1
  fi
}

require_exact_line() {
  local file="$1"
  local expected="$2"
  if ! grep -Fqx "$expected" "$file"; then
    echo "$file must contain exactly: $expected" >&2
    echo "Move the local file aside and rerun pnpm local:auth:setup, or update it deliberately." >&2
    exit 1
  fi
}

path_exists() {
  [[ -e "$1" || -L "$1" ]]
}

require_regular_readable_file() {
  local file="$1"
  local description="$2"
  if [[ -L "$file" || ! -f "$file" || ! -r "$file" ]]; then
    echo "$description must be a readable regular file, not a symlink: $file" >&2
    exit 1
  fi
}

prepare_certificate() {
  local certificate_exists=false
  local key_exists=false
  path_exists "$certificate" && certificate_exists=true
  path_exists "$key" && key_exists=true

  if [[ "$certificate_exists" != "$key_exists" ]]; then
    echo "Local TLS certificate and key must either both exist or both be absent. Refusing to replace one file." >&2
    exit 1
  fi

  if [[ "$certificate_exists" == true ]]; then
    require_regular_readable_file "$certificate" "Local TLS certificate"
    require_regular_readable_file "$key" "Local TLS key"
    chmod 600 "$certificate" "$key"
    return
  fi

  echo "Creating a localhost certificate with the existing mkcert development CA."
  echo "This does not run mkcert -install or change any system trust settings."
  mkcert -cert-file "$certificate" -key-file "$key" localhost
  require_regular_readable_file "$certificate" "Local TLS certificate"
  require_regular_readable_file "$key" "Local TLS key"
  chmod 600 "$certificate" "$key"
}

setup() {
  require_command mkcert
  require_command openssl
  if [[ -L "$cert_dir" || ( -e "$cert_dir" && ! -d "$cert_dir" ) ]]; then
    echo "Local TLS state directory must be a directory, not a symlink or file: $cert_dir" >&2
    exit 1
  fi
  mkdir -p "$cert_dir"
  umask 077
  prepare_certificate

  if [[ ! -e "$api_vars" ]]; then
    {
      printf '# Generated locally by pnpm local:auth:setup. Do not commit.\n'
      printf 'BETTER_AUTH_SECRET=%s\n' "$(openssl rand -hex 32)"
      printf 'BETTER_AUTH_BASE_URL=%s\n' "$api_origin"
      printf 'BETTER_AUTH_TRUSTED_ORIGINS=%s\n' "$trusted_origins"
    } > "$api_vars"
    chmod 600 "$api_vars"
  else
    require_exact_line "$api_vars" "BETTER_AUTH_BASE_URL=$api_origin"
    require_exact_line "$api_vars" "BETTER_AUTH_TRUSTED_ORIGINS=$trusted_origins"
    if ! grep -Eq '^BETTER_AUTH_SECRET=.{32,}$' "$api_vars"; then
      echo "$api_vars must contain a nonempty BETTER_AUTH_SECRET of at least 32 characters." >&2
      exit 1
    fi
  fi

  if [[ ! -e "$api_config" ]]; then
    cp "$api_config_template" "$api_config"
  fi

  if [[ ! -e "$web_env" ]]; then
    printf 'NEXT_PUBLIC_API_BASE_URL=%s\n' "$api_origin" > "$web_env"
  else
    require_exact_line "$web_env" "NEXT_PUBLIC_API_BASE_URL=$api_origin"
  fi

  echo "Local HTTPS authentication files are ready."
  echo "Certificates: $cert_dir"
  echo "Next run pnpm db:dev:up, pnpm db:dev:migrate, then start the API and web commands in separate terminals."
}

require_setup() {
  require_regular_readable_file "$certificate" "Local TLS certificate"
  require_regular_readable_file "$key" "Local TLS key"
  if [[ ! -f "$api_vars" || ! -f "$api_config" || ! -f "$web_env" ]]; then
    echo "Local HTTPS setup is incomplete. Run pnpm local:auth:setup first." >&2
    exit 1
  fi
}

read_app_database_password() {
  require_regular_readable_file "$credentials_file" "Local development credentials"

  local line
  local password=""
  local matches=0
  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      APP_DATABASE_PASSWORD=*)
        password="${line#APP_DATABASE_PASSWORD=}"
        matches=$((matches + 1))
        ;;
    esac
  done < "$credentials_file"

  if [[ "$matches" -ne 1 || ! "$password" =~ ^[[:xdigit:]]{48}$ ]]; then
    echo "Local development credentials must contain one valid APP_DATABASE_PASSWORD." >&2
    exit 1
  fi

  printf '%s' "$password"
}

start_api() {
  require_setup
  if [[ ! -e "$credentials_file" ]]; then
    echo "Local development database credentials are missing. Run pnpm db:dev:up and pnpm db:dev:migrate first." >&2
    exit 1
  fi
  local app_database_password
  app_database_password="$(read_app_database_password)"
  cd "$repo_root/apps/api"
  # Start with a deliberately small environment. The Worker receives only its
  # restricted app connection URL, never owner or migrator credentials.
  exec env -i \
    HOME="$HOME" PATH="$PATH" TMPDIR="${TMPDIR:-/tmp}" LANG="${LANG:-C}" \
    CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="postgresql://app:${app_database_password}@localhost:5434/dayli_dev" \
    pnpm exec wrangler dev --config wrangler.local.jsonc --local \
      --ip 127.0.0.1 --port 8787 --local-protocol https \
      --https-key-path "$key" --https-cert-path "$certificate"
}

start_web() {
  require_setup
  cd "$repo_root/apps/web"
  exec pnpm exec next dev --hostname localhost --port 3000 --experimental-https \
    --experimental-https-key "$key" --experimental-https-cert "$certificate"
}

case "${1:-}" in
  setup) setup ;;
  api) start_api ;;
  web) start_web ;;
  *)
    echo "Usage: $0 {setup|api|web}" >&2
    exit 1
    ;;
esac
