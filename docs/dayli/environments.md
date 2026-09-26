# Environments

This guide separates the environments that exist today from the production environment that does not. Use placeholder values in commands. Never add real account IDs, hosts, database URLs, tokens, or customer data to Git, issues, PRs, or command output.

## Request flow

| Environment | Client path | Database path | Purpose |
| --- | --- | --- | --- |
| Local, no database | Browser or emulator -> local Wrangler -> Hono | None | Route, contract, and UI work that does not use PostgreSQL. |
| Local, database simulation | Browser or emulator -> local Wrangler -> local Hyperdrive-compatible binding -> Docker PostgreSQL | Direct local PostgreSQL connection | Database development. This does not exercise Cloudflare's real Hyperdrive service. |
| Staging | Not validated for the new project | Not connected to the new project | Deferred until the separate Neon staging project is provisioned. |
| PR check | Not run automatically | Not connected | Future manual proof path only. |
| Production | Not provisioned | Not provisioned | Future release environment. |

At the time of this review, the separate Neon staging project is empty. It has no roles, migrations, or Hyperdrive attached. A pre-existing staging Worker, if one exists, remains connected to its old configuration and must be inventoried and retired before use. It is not a validated endpoint for the new project. Production is also unprovisioned. The API has ordinary HTTP routes for clients. `HyperdriveIntegrationEntrypoint` is a non-HTTP `WorkerEntrypoint`, callable only by the private Worker service binding used by the future integration check.

## Prerequisites

Install Node.js 24 or later, pnpm 10, Docker with Compose not required, and the stable Flutter SDK when working on mobile. Install workspace dependencies from the repository root:

```bash
pnpm install --frozen-lockfile
```

Keep credentials in your shell, a password manager, GitHub environment secrets, or ignored local files. `.env*` and `.dev.vars*` are ignored. Do not put credentials in `wrangler.jsonc`, source files, test fixtures, or generated clients.

## Local PostgreSQL 18

The repository includes a PostgreSQL 18 Docker test fixture for development and integration tests. It is separate from product data and uses an isolated database. They use a Docker volume, so stopping or removing the container does not remove the data. The block generates a password only for a new volume and refuses to replace a missing credential for existing data.

```bash
state_dir="${XDG_STATE_HOME:-$HOME/.local/state}/dayli"
password_file="$state_dir/postgres.env"
mkdir -p "$state_dir"
umask 077

if docker container inspect dayli-postgres >/dev/null 2>&1; then
  if [ ! -f "$password_file" ]; then
    echo "Existing dayli-postgres has no saved local password. Recover it or reset the database." >&2
    exit 1
  fi
  docker start dayli-postgres
else
  if [ ! -f "$password_file" ]; then
    if docker volume inspect dayli-postgres-data >/dev/null 2>&1; then
      echo "Existing PostgreSQL volume has no saved local password. Recover it or reset the database." >&2
      exit 1
    fi
    openssl rand -hex 24 | awk '{ print "POSTGRES_PASSWORD=" $0 }' > "$password_file"
  fi
  docker volume create dayli-postgres-data
  docker run --detach --name dayli-postgres --restart unless-stopped \
    --env-file "$password_file" \
    -e POSTGRES_USER=dayli \
    -e POSTGRES_DB=dayli \
    -p 127.0.0.1:5432:5432 \
    -v dayli-postgres-data:/var/lib/postgresql/data \
    postgres:16
fi

set -a
. "$password_file"
set +a
docker exec dayli-postgres pg_isready -U dayli -d dayli
```

The generated password is local-only and the state file has owner-only permissions. Keep it outside the repository. Rerunning the block starts an existing container and preserves its password. If the container was removed but the volume and password file remain, it recreates the container with the existing password. If the password file is missing for existing data, the block stops rather than creating an unusable replacement credential. Recover the original password or reset the local database.

Stop the database without removing its data:

```bash
docker stop dayli-postgres
```

Reset removes all local data. Stop any process that uses the database first:

```bash
docker rm -f dayli-postgres
docker volume rm dayli-postgres-data
rm -f "${XDG_STATE_HOME:-$HOME/.local/state}/dayli/postgres.env"
```

Run the creation commands again after a reset. This database is intentionally bound only to `127.0.0.1`. Do not publish it to a LAN interface.

### Direct database smoke test

Load the local password and run the package check. The password produced above is URL-safe.

```bash
set -a
. "${XDG_STATE_HOME:-$HOME/.local/state}/dayli/postgres.env"
set +a
DATABASE_URL="postgres://dayli:${POSTGRES_PASSWORD}@127.0.0.1:5432/dayli" \
  pnpm --filter @dayli/db db:check
```

The local transaction proof applies the staging-only probe fixture as `migrator`, then uses the restricted `app` role to prove Drizzle commit, explicit rollback, constraint recovery, cleanup, and authorization. The fixture is never a product migration. Do not treat `wrangler deploy` as a database migration.

## Local API and clients

### API without a database

The checked-in `apps/api/wrangler.jsonc` has no Hyperdrive binding. Use it for the API's current HTTP routes:

```bash
pnpm --dir apps/api dev
```

Wrangler normally listens on `http://127.0.0.1:8787`. This mode cannot exercise code that requires `env.HYPERDRIVE`.

### API with local Hyperdrive simulation

Create an ignored local config that adds the binding. The ID is a local label only. It is not a Cloudflare resource ID.

```bash
cat > apps/api/wrangler.local.jsonc <<'EOF'
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "dayli-api-local",
  "main": "src/index.ts",
  "compatibility_date": "2026-03-10",
  "compatibility_flags": ["nodejs_compat"],
  "observability": { "enabled": true },
  "hyperdrive": [
    { "binding": "HYPERDRIVE", "id": "local-hyperdrive" }
  ]
}
EOF

set -a
. "${XDG_STATE_HOME:-$HOME/.local/state}/dayli/postgres.env"
set +a
CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="postgres://dayli:${POSTGRES_PASSWORD}@127.0.0.1:5432/dayli" \
  pnpm --dir apps/api exec wrangler dev --config wrangler.local.jsonc
```

`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` tells Wrangler to supply a connection string to local PostgreSQL for the `HYPERDRIVE` binding. It does not create, contact, or simulate Cloudflare's real Hyperdrive configuration, connection pooling, network path, caching, or credentials. Run the staging integration check before relying on a Hyperdrive change.

`wrangler.local.jsonc` contains no secret, but it is local setup and should remain untracked. Remove it when it is no longer needed.

### Web and mobile API addresses

Start the web shell with:

```bash
pnpm --dir apps/web dev
```

It normally listens on `http://localhost:3000`. Flutter receives its API origin through `DAYLI_API_BASE_URL`. Use these addresses for the local Worker:

- Browser on the development machine: `http://127.0.0.1:8787`
- Android emulator: `http://10.0.2.2:8787`
- iOS Simulator: `http://127.0.0.1:8787`
- Android physical device over USB: `http://127.0.0.1:8787` after `adb reverse tcp:8787 tcp:8787`

For an Android device, start Wrangler on its default loopback address, then run:

```bash
adb reverse tcp:8787 tcp:8787
cd apps/mobile
flutter run --dart-define=DAYLI_API_BASE_URL=http://127.0.0.1:8787
```

`adb reverse` forwards the device's loopback port to the development machine. It avoids exposing the debug Worker on the LAN, and Android debug builds allow cleartext only for the emulator and loopback aliases. Remove the mapping with `adb reverse --remove tcp:8787` when finished. Use a deployed HTTPS staging API for iOS physical devices. Configure CORS for browser clients before cross-origin calls. The current API has no client-facing database route, so an address alone does not prove database integration.

Run the Flutter shell separately:

```bash
cd apps/mobile
flutter pub get
flutter run
```

## Staging

Staging integration is deferred. At the time of this review, the separate Neon staging project is empty: it has no roles, migrations, or Hyperdrive attached. Any pre-existing `dayli-api-staging` Worker remains connected to its old configuration and must be inventoried and retired before use. It is not a validated endpoint for the new project. Production is unprovisioned. Do not deploy, migrate, or test against either environment until the staging project has been provisioned and reviewed.

When staging is approved for provisioning, use a separate Neon project with synthetic data only. It must not share a Neon project, branch, data, credentials, or restore point with production. Follow the role bootstrap sequence in [Database migrations](database-migrations.md#roles-and-connections), then create a caching-disabled Hyperdrive configuration for the restricted `app` role. Prepare the ignored `apps/api/wrangler.staging.jsonc` and `apps/api/wrangler.hyperdrive-test.jsonc` from their examples. Set exact public HTTPS origins and add `BETTER_AUTH_SECRET` only through `wrangler secret put`. Do not put secrets in configuration, shell history, or Git.

After provisioning, the manual proof can deploy the current checkout and run the private Hyperdrive check from a trusted machine with approved credentials:

```bash
bash <<'BASH'
set -euo pipefail
read -r -p "Cloudflare account ID: " CLOUDFLARE_ACCOUNT_ID </dev/tty
read -r -s -p "Cloudflare API token: " CLOUDFLARE_API_TOKEN </dev/tty
printf "\n"
export CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_API_TOKEN
trap 'unset CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_API_TOKEN' EXIT
: "${CLOUDFLARE_ACCOUNT_ID:?Cloudflare account ID is required}"
: "${CLOUDFLARE_API_TOKEN:?Cloudflare API token is required}"

commit_sha="$(git rev-parse HEAD)"
pnpm --dir apps/api exec wrangler deploy --config wrangler.staging.jsonc
pnpm --filter @dayli/api test:hyperdrive:staging
printf 'Hyperdrive check commit: %s\n' "$commit_sha"
BASH
```

The GitHub `staging` environment retains the protected `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_STAGING_HYPERDRIVE_ID` secrets, plus `CLOUDFLARE_ACCOUNT_ID`, `STAGING_API_SERVICE_NAME`, and `STAGING_HYPERDRIVE_NAME` variables for that future proof. `.github/workflows/staging-hyperdrive.yml` runs only through manual dispatch. It has no pull request or `main` push trigger and does not use `pull_request_target`. Its credential and Hyperdrive validation safeguards remain in place. The separate `cleanup-hyperdrive-preview.yml` workflow remains enabled only to safely remove any previously deployed trusted PR preview after the PR closes.

## Legacy Supabase migration inventory

Do not reuse a Neon, application, owner, or service-role credential to inspect the legacy Supabase database. Before an approved rehearsal, a legacy administrator must provision a separate `LEGACY_SUPABASE_READONLY_DATABASE_URL` role with `CONNECT` and `SELECT` only on the approved legacy tables. `pnpm db:migration:inventory` requires TLS, opens `BEGIN READ ONLY`, and emits aggregate counts only. Do not run it during this planning phase or against production without explicit authorisation. Keep its output in an approved protected evidence location rather than Git. See [Supabase to Neon migration boundary](supabase-neon-migration-boundary.md) for its fixed table boundary and rehearsal gates.

## Future production

Production is not provisioned. Do not deploy the default `dayli-api` Worker as a shortcut for staging or testing. Before the first production deploy, provision and document separately:

1. A production Worker, separate deployment configuration, public URL or custom domain, and client base URL.
2. A production-only PostgreSQL database and Hyperdrive configuration.
3. A least-privilege production token and separate secret store entries. Never reuse the staging token, database, Hyperdrive ID, or Worker name.
4. Reviewed additive database migrations, backups, restore testing, a rollback or forward-fix plan, and compatibility checks for existing mobile clients.
5. A Better Auth secret stored as a Worker secret, a public HTTPS base URL, exact trusted browser origins, CORS/origin policy, observability, alerts, and an approved release owner.

Deploy migrations through a controlled database connection before code that requires them. Keep destructive changes behind a compatible release and verify rollback against a restored copy. Production should gain its own protected GitHub environment and approvals before it receives credentials.

For the staging-specific configuration and test details, see [`apps/api/README.md`](../../apps/api/README.md). For the database smoke check, see [`packages/db/README.md`](../../packages/db/README.md).
