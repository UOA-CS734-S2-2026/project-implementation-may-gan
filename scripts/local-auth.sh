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

setup() {
  require_command mkcert
  require_command openssl
  mkdir -p "$cert_dir"
  umask 077

  if [[ ! -f "$certificate" || ! -f "$key" ]]; then
    echo "Creating a localhost certificate with the existing mkcert development CA."
    echo "This does not run mkcert -install or change any system trust settings."
    mkcert -cert-file "$certificate" -key-file "$key" localhost
  fi
  chmod 600 "$certificate" "$key"

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
  if [[ ! -f "$certificate" || ! -f "$key" || ! -f "$api_vars" || ! -f "$api_config" || ! -f "$web_env" ]]; then
    echo "Local HTTPS setup is incomplete. Run pnpm local:auth:setup first." >&2
    exit 1
  fi
}

start_api() {
  require_setup
  if [[ ! -f "$credentials_file" ]]; then
    echo "Local development database credentials are missing. Run pnpm db:dev:up and pnpm db:dev:migrate first." >&2
    exit 1
  fi
  set -a
  # This file is generated locally by scripts/dev-db.sh with mode 0600.
  # shellcheck disable=SC1090
  . "$credentials_file"
  set +a
  export CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="postgresql://app:${APP_DATABASE_PASSWORD}@localhost:5434/dayli_dev"
  cd "$repo_root/apps/api"
  exec pnpm exec wrangler dev --config wrangler.local.jsonc --local \
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
