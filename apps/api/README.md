# Dayli API

For local PostgreSQL, local Worker, staging, and future production setup, see the [environment guide](../../docs/dayli/environments.md).

## Staging Hyperdrive check

`test:hyperdrive:staging` proves that a deployed API Worker can use its `HYPERDRIVE` binding. The Workers Vitest runtime calls `HyperdriveIntegrationEntrypoint` through a remote Worker service binding. It retains the connectivity check and additionally proves Drizzle commit, explicit rollback, post-error recovery, all four constraint classes, restricted-role authorization, and visibility from a fresh invocation. Clients are created per invocation; Hyperdrive manages edge cleanup and query caching must be disabled.

The entrypoint is not an HTTP route or an OpenAPI operation. Only a Worker with its service binding can call it. Each request closes its postgres.js client in `finally` after the operation completes, so it does not retain a Hyperdrive client in the Worker isolate.

### Reachability and access

`dayli-api-staging` is deliberately public through its Workers.dev address so the staging web and mobile clients can reach the ordinary API. It is a staging-only endpoint. The API's normal authentication and authorization rules still apply. Do not use it for production traffic or put database credentials in client applications.

The `HyperdriveIntegrationEntrypoint` stays private because it is a `WorkerEntrypoint`, not an HTTP handler. The temporary Vitest proxy Worker and each PR preview Worker set `workers_dev: false`, so Cloudflare does not give them a public Workers.dev URL. The test reaches the preview only through its private service binding.

### One-time Cloudflare setup

1. Create a PostgreSQL database used only for staging. Do not reuse production data or credentials. Use a least-privilege database user and require TLS when the provider supports it.
2. In **Workers & Pages** > **Hyperdrive**, create a configuration for that staging database. Disable query caching, then run `packages/db/admin/bootstrap-staging-probe.sql` once as `migrator`. Keep its ID out of Git.
3. Copy `wrangler.staging.example.jsonc` to the ignored `wrangler.staging.jsonc`. Keep its name as `dayli-api-staging`, replace the Hyperdrive ID placeholder, and keep the binding name `HYPERDRIVE`. Replace its public placeholder base URL and trusted browser origins with exact HTTPS staging origins.
4. Set the ignored Worker secret with `wrangler secret put BETTER_AUTH_SECRET --config wrangler.staging.jsonc`. Use a value of at least 32 characters from the approved secret store. Never put it in `vars`, JSON configuration, or Git.
5. Copy `wrangler.hyperdrive-test.example.jsonc` to the ignored `wrangler.hyperdrive-test.jsonc`. Set its service placeholder to `dayli-api-staging`. It declares the private remote service binding and contains no database connection string.

### Reproduce locally

Run this only from a trusted machine with an account ID and an API token that can deploy the staging Worker and use the remote binding. Load them from an approved secret store. The temporary Bash process below accepts the token without echoing it and discards both values when it exits. Deploy the current checkout immediately before testing. Do not test a Worker left over from another commit.

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

If a secure credential tool supplies the values instead, replace the `read` commands but keep the required-variable guards. A deploy failure stops the test and prevents the SHA from printing. Record the commit SHA, date, runtime versions, and pass/fail result. Do not record Hyperdrive IDs, database hosts, connection strings, credentials, or query logs.

### Protected GitHub workflow

`.github/workflows/staging-hyperdrive.yml` runs on relevant API, database, lockfile, or workflow PR changes to `main`, on the same relevant pushes to `main`, and on manual dispatch. It uses the GitHub `staging` environment. Add these values to that environment:

- secret `CLOUDFLARE_API_TOKEN`, with permission to deploy Workers, use remote service bindings, and read the staging Hyperdrive configuration;
- secret `CLOUDFLARE_STAGING_HYPERDRIVE_ID`;
- variable `CLOUDFLARE_ACCOUNT_ID`;
- variable `STAGING_API_SERVICE_NAME`, set exactly to `dayli-api-staging`;
- variable `STAGING_HYPERDRIVE_NAME`, set to the expected staging Hyperdrive configuration name.

For a same-repository PR, the workflow deploys `dayli-api-pr-<number>` with `workers_dev: false` and points the private test binding at it. The normal job attempts deletion in an `always()` cleanup step. `.github/workflows/cleanup-hyperdrive-preview.yml` makes a separate idempotent deletion attempt when a trusted PR to `main` closes, without checking out PR code. Both workflows use the same per-PR concurrency group, so close cleanup cannot race an in-flight test. Fork PR jobs are skipped before they receive the staging environment or its credentials. The workflows do not use `pull_request_target`.

Pushes to `main` and manual runs deploy only `dayli-api-staging`. The workflow rejects any other staging service name, reads the Hyperdrive configuration from Cloudflare, and fails unless query caching is disabled before deployment. Configure the `staging` environment with one required reviewer from the GitHub `May Gan` team and prevent the triggering actor from approving their own deployment. Its final `gate` status is required and path-aware, so unrelated changes receive a successful no-op. It never targets the default `dayli-api` Worker.
