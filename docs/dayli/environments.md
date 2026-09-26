# Environments

This guide separates the environments that exist today from the production environment that does not. Use placeholder values in commands. Never add real account IDs, hosts, database URLs, tokens, or customer data to Git, issues, PRs, or command output.

## Request flow

| Environment | Client path | Database path | Purpose |
| --- | --- | --- | --- |
| Local, no database | Browser or emulator -> local Wrangler -> Hono | None | Route, contract, and UI work that does not use PostgreSQL. |
| Local, database simulation | Browser or emulator -> local Wrangler -> local Hyperdrive-compatible binding -> Docker PostgreSQL | Direct local PostgreSQL connection | Database development. This does not exercise Cloudflare's real Hyperdrive service. |
| Staging | Staging web/mobile -> public `dayli-api-staging` -> real `HYPERDRIVE` -> isolated staging PostgreSQL | Cloudflare Hyperdrive | Credentialed integration and client testing. |
| PR check | Private test Worker -> service binding -> private `dayli-api-pr-<number>` -> real staging `HYPERDRIVE` | Cloudflare Hyperdrive | Prove a trusted PR can connect. The preview has no public URL. |
| Production | Not provisioned | Not provisioned | Future release environment. |

The API has ordinary HTTP routes for clients. `HyperdriveIntegrationEntrypoint` is a non-HTTP `WorkerEntrypoint`, callable only by the private Worker service binding used by the integration check.

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

It normally listens on `http://localhost:3000`. The web app reads the API origin from `NEXT_PUBLIC_API_BASE_URL` (see `apps/web/.env.example`) and calls it with the browser's Better Auth session cookie. The API returns credentialed CORS headers for `/api/v1/*` only to origins in `BETTER_AUTH_TRUSTED_ORIGINS`, which must be exact HTTPS origins, so a browser session against a local Worker needs HTTPS origins for both. Use these addresses for the local Worker:

- Browser on the development machine: `http://127.0.0.1:8787`
- Android emulator: `http://10.0.2.2:8787`
- iOS Simulator: `http://127.0.0.1:8787`
- Physical device: `http://<host-lan-ip>:8787`, with the device on the same trusted network

A physical device cannot use `localhost` for a server on the development machine. Start Wrangler with an explicitly chosen LAN bind address, such as `--ip 0.0.0.0`, only on a trusted network. Configure CORS for the client origin before browser clients make cross-origin calls. The current API has no client-facing database route, so an address alone does not prove database integration.

Run the Flutter shell separately:

```bash
cd apps/mobile
flutter pub get
flutter run
```

## Staging

Staging has a public Worker named `dayli-api-staging`, a separate Neon staging project containing synthetic data only, and a real Cloudflare Hyperdrive configuration. It does not share a Neon project, branch, data, credentials, or restore point with production. The public Worker exists so staging web and mobile clients can reach the ordinary API. Its normal authentication and authorization still apply. It is not a production endpoint.

Before creating Hyperdrive, follow the role bootstrap sequence in [Database migrations](database-migrations.md#roles-and-connections): run the owner and migrator SQL files in their separate connections, then require an all-true result from the read-only verification query. Set the first `app` password only with trusted interactive `psql`, connected as the owner, using `\password app`. Neon Console or API password reset cannot set a password for a role that has none. A reset may rotate an existing password later, followed by verification. Do not use Neon Console to create any application role because it grants `neon_superuser`. If an earlier owner run stopped at SQLSTATE `42501`, use the documented recovery sequence rather than adding membership or additional `app` grants.

Prepare ignored `apps/api/wrangler.staging.jsonc` and `apps/api/wrangler.hyperdrive-test.jsonc` from their examples. Set `BETTER_AUTH_BASE_URL` and `BETTER_AUTH_TRUSTED_ORIGINS` in the ignored staging configuration to exact public HTTPS origins, then add `BETTER_AUTH_SECRET` with `wrangler secret put BETTER_AUTH_SECRET --config wrangler.staging.jsonc`. The secret must be at least 32 characters and must not appear in configuration, shell history, or Git. Auth stays unmounted if any binding is absent or invalid. Use the protected staging values only on a trusted machine. Load them from an approved secret store. The temporary Bash process below accepts the token without echoing it and discards both values when it exits. Deploy the current checkout before running the real binding check:

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

If a secure credential tool supplies the values instead, replace the `read` commands but keep the required-variable guards. A deploy failure stops the test and prevents the SHA from printing. Use the configured staging Worker URL as the future staging web/mobile base URL. It is intentionally not written here. Do not route a client to a PR preview because previews set `workers_dev: false` and have no public endpoint.

The GitHub `staging` environment contains:

- secret `CLOUDFLARE_API_TOKEN` with Worker deploy, remote service binding, and Hyperdrive read access;
- secret `CLOUDFLARE_STAGING_HYPERDRIVE_ID`;
- variable `CLOUDFLARE_ACCOUNT_ID`;
- variable `STAGING_API_SERVICE_NAME`, exactly `dayli-api-staging`;
- variable `STAGING_HYPERDRIVE_NAME`, the expected staging Hyperdrive configuration name.

The credentialed deploy/test workflow runs for relevant same-repository PR changes, relevant pushes to `main`, and manual dispatch. It never uses `pull_request_target`. Fork PRs are skipped before they receive the staging environment or its credentials. For an eligible PR, it deploys `dayli-api-pr-<number>` and tests it only through a private service binding. The normal job attempts deletion in an `always()` step. The separate `cleanup-hyperdrive-preview.yml` workflow runs for every trusted PR to `main` close, without checking out PR code, and makes an idempotent deletion attempt. Both workflows use the same per-PR concurrency group, so close cleanup cannot race an in-flight test.

Staging uses the administrator-provisioned Neon PostgreSQL database through Hyperdrive. This is staging-only; production remains unprovisioned and must use separate resources.

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
