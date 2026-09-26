# Dayli API

For local PostgreSQL, local Worker, staging, and future production setup, see the [environment guide](../../docs/dayli/environments.md).

## Staging Hyperdrive check

`test:hyperdrive:staging` is a future manual proof that a deployed API Worker can use its `HYPERDRIVE` binding. At the time of this review, the separate Neon staging project is empty, with no roles, migrations, or Hyperdrive attached. Any pre-existing staging Worker remains connected to its old configuration and must be inventoried and retired before use. It is not a validated endpoint for the new project. Production is unprovisioned. Do not run the credentialed proof until staging provisioning is complete and reviewed. When available, the Workers Vitest runtime calls `HyperdriveIntegrationEntrypoint` through a remote Worker service binding. It proves connectivity, Drizzle commit, explicit rollback, post-error recovery, constraint classes, restricted-role authorization, and fresh-invocation visibility. Clients are created per invocation; Hyperdrive manages edge cleanup and query caching must be disabled.

The entrypoint is not an HTTP route or an OpenAPI operation. Only a Worker with its service binding can call it. Each request closes its postgres.js client in `finally` after the operation completes, so it does not retain a Hyperdrive client in the Worker isolate.

### Reachability and access

A pre-existing public staging endpoint, if present, remains connected to its old configuration and is not validated for the new project. Inventory and retire it before use. After provisioning, `dayli-api-staging` may be public for staging web and mobile clients, while its normal authentication and authorization rules continue to apply. Do not use it for production traffic or put database credentials in client applications.

The `HyperdriveIntegrationEntrypoint` stays private because it is a `WorkerEntrypoint`, not an HTTP handler. The future Vitest proxy Worker sets `workers_dev: false`, so Cloudflare does not give it a public Workers.dev URL. The test reaches the staging Worker only through its private service binding.

### Future provisioning

Do not perform these steps until the separate staging project is approved for provisioning.

1. Create a separate Neon project used only for staging and synthetic data. Do not reuse a production project, branch, data, credentials, or restore point.
2. Complete the owner and migrator role-bootstrap sequence in [Database migrations](../../docs/dayli/database-migrations.md#roles-and-connections). Do not create application roles through Neon Console. Require the read-only bootstrap verification to report only `true` values before continuing.
3. In **Workers & Pages** > **Hyperdrive**, create a configuration for the restricted `app` role in that staging database. Disable query caching, then run `packages/db/admin/bootstrap-staging-probe.sql` once as `migrator`. Keep its ID out of Git.
4. Copy `wrangler.staging.example.jsonc` to the ignored `wrangler.staging.jsonc`. Keep its name as `dayli-api-staging`, replace the Hyperdrive ID placeholder, and keep the binding name `HYPERDRIVE`. Replace its public placeholder base URL and trusted browser origins with exact HTTPS staging origins.
5. Set the ignored Worker secret with `wrangler secret put BETTER_AUTH_SECRET --config wrangler.staging.jsonc`. Use a value of at least 32 characters from the approved secret store. Never put it in `vars`, JSON configuration, or Git.
6. Copy `wrangler.hyperdrive-test.example.jsonc` to the ignored `wrangler.hyperdrive-test.jsonc`. Set its service placeholder to `dayli-api-staging`. It declares the private remote service binding and contains no database connection string.

### Reproduce locally

After staging is provisioned, run this only from a trusted machine with an account ID and an API token that can deploy the staging Worker and use the remote binding. Load them from an approved secret store. The temporary Bash process below accepts the token without echoing it and discards both values when it exits. Deploy the current checkout immediately before testing. Do not test a Worker left over from another commit.

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

`.github/workflows/staging-hyperdrive.yml` runs only on manual dispatch. It has no pull request or `main` push trigger. This preserves a credentialed proof path for after staging is provisioned without making it an automatic PR gate or staging deployment.

After provisioning, the GitHub `staging` environment must contain `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_STAGING_HYPERDRIVE_ID` secrets, plus `CLOUDFLARE_ACCOUNT_ID`, `STAGING_API_SERVICE_NAME`, and `STAGING_HYPERDRIVE_NAME` variables. The workflow validates the service name and Hyperdrive configuration before deploying, rejects enabled query caching, and never targets the default `dayli-api` Worker. It does not use `pull_request_target`.

`.github/workflows/cleanup-hyperdrive-preview.yml` remains enabled to make an idempotent, credential-guarded deletion attempt for a trusted PR preview that may have been deployed before this deferral. It does not check out or execute PR code.
