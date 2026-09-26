#!/usr/bin/env bash

# Lifecycle for the persistent local development database. This is deliberately
# separate from scripts/verify-local.sh and its disposable test fixture.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
state_dir="${XDG_STATE_HOME:-$HOME/.local/state}/dayli"
credentials_file="$state_dir/development-postgres.env"
compose_file="$repo_root/packages/db/docker-compose.dev.yml"
compose_project="dayli-development"
volume_name="dayli-development-postgres-data"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Local development database requires $1." >&2
    exit 1
  fi
}

require_docker() {
  require_command docker
  docker compose version >/dev/null
  docker info >/dev/null
}

create_credentials_if_needed() {
  if [[ -f "$credentials_file" ]]; then
    return
  fi

  if docker volume inspect "$volume_name" >/dev/null 2>&1; then
    echo "The development database volume exists but $credentials_file is missing." >&2
    echo "Recover that file or reset explicitly with DAYLI_DEV_DB_RESET='DELETE development database' pnpm db:dev:reset." >&2
    exit 1
  fi

  require_command openssl
  mkdir -p "$state_dir"
  umask 077
  {
    printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 24)"
    printf 'MIGRATOR_DATABASE_PASSWORD=%s\n' "$(openssl rand -hex 24)"
    printf 'APP_DATABASE_PASSWORD=%s\n' "$(openssl rand -hex 24)"
  } > "$credentials_file"
}

load_credentials() {
  if [[ ! -f "$credentials_file" ]]; then
    echo "Local development credentials are missing. Run pnpm db:dev:up first." >&2
    exit 1
  fi

  set -a
  # This file is generated locally by this script with mode 0600.
  # shellcheck disable=SC1090
  . "$credentials_file"
  set +a
}

compose() {
  docker compose --project-name "$compose_project" --env-file "$credentials_file" -f "$compose_file" "$@"
}

migrator_url() {
  printf 'postgresql://migrator:%s@localhost:5434/dayli_dev' "$MIGRATOR_DATABASE_PASSWORD"
}

case "${1:-}" in
  up)
    require_docker
    create_credentials_if_needed
    chmod 600 "$credentials_file"
    compose up -d --wait
    echo "Local development PostgreSQL is ready on localhost:5434/dayli_dev."
    ;;
  down)
    require_docker
    if [[ ! -f "$credentials_file" ]]; then
      echo "Local development credentials are missing; refusing to guess a Compose environment." >&2
      exit 1
    fi
    compose down --remove-orphans
    echo "Local development PostgreSQL stopped. Data is preserved."
    ;;
  reset)
    require_docker
    if [[ "${DAYLI_DEV_DB_RESET:-}" != "DELETE development database" ]]; then
      echo "Refusing to delete local development data." >&2
      echo "Set DAYLI_DEV_DB_RESET='DELETE development database' and rerun pnpm db:dev:reset." >&2
      exit 1
    fi
    if [[ -f "$credentials_file" ]]; then
      compose down -v --remove-orphans
    else
      docker volume rm "$volume_name" >/dev/null 2>&1 || true
    fi
    rm -f "$credentials_file"
    echo "Local development PostgreSQL data and credentials were deleted."
    ;;
  migrate)
    load_credentials
    MIGRATION_TARGET=development DATABASE_URL="$(migrator_url)" pnpm --filter @dayli/db db:migrate
    ;;
  verify)
    load_credentials
    MIGRATION_TARGET=development DATABASE_URL="$(migrator_url)" pnpm --filter @dayli/db db:verify
    ;;
  *)
    echo "Usage: $0 {up|down|reset|migrate|verify}" >&2
    exit 1
    ;;
esac
