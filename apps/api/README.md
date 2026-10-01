# Dayli API

For local HTTPS sign-in, staging and production boundaries, see [Environments](../../docs/dayli/environments.md). For Google OAuth and Resend, see [Authentication compatibility](../../docs/dayli/authentication-compatibility.md).

## Staging Hyperdrive check

The staging owner reports verified restricted roles and grants, migrations `0000` through `0007`, an `app` Hyperdrive with query caching disabled, and the staging probe fixture. The API Worker is deployed on its HTTPS custom domain with `workers.dev` disabled. The manual staging Hyperdrive workflow passed at `1fb6388` and uploaded sanitized evidence for connection, transactions, constraint classes, restricted-role permissions, and fresh-invocation visibility. The staging browser email/password flow and sign-out redirect worked manually. Google, Resend, and native auth are not validated. Production is not deployed.

`test:hyperdrive:staging` calls `HyperdriveIntegrationEntrypoint` through a private Worker service binding. A complete proof checks connectivity, Drizzle commit, explicit rollback, post-error recovery, constraint classes, restricted-role authorization, and fresh-invocation visibility. Clients are created per invocation, and query caching stays disabled.

The entrypoint is not an HTTP route or an OpenAPI operation. Only a Worker with its service binding can call it. Each request closes its postgres.js client in `finally` after the operation completes, so it does not retain a Hyperdrive client in the Worker isolate.

### Reachability and access

The old staging Worker was deleted. The replacement `dayli-api-staging` Worker is deployed on its HTTPS custom domain, but staging authentication remains unverified. Its `workers.dev` endpoint stays disabled. Normal authentication and authorization rules still apply. Do not use it for production traffic or put database credentials in client applications.

The `HyperdriveIntegrationEntrypoint` stays private because it is a `WorkerEntrypoint`, not an HTTP handler. The Vitest test proxy sets `workers_dev: false`, so it has no public Workers.dev URL. The test reaches the staging Worker only through its private service binding.

### Provisioning reference

The staging owner reports that the restricted roles passed [bootstrap verification](../../docs/dayli/database-migrations.md#roles-and-connection-boundaries) and the passwordless test probe was removed. The database migration and Hyperdrive steps below are already done for staging. Use the list to check a fresh environment, not as instructions to repeat staging migrations or recreate its Hyperdrive. Do not reuse a production project, branch, data, credentials, or restore point.

1. Complete the owner and migrator role-bootstrap sequence in [Database migrations](../../docs/dayli/database-migrations.md#roles-and-connection-boundaries). Do not create application roles through Neon Console. Require the read-only bootstrap verification to report only `true` values before continuing.
2. In **Workers & Pages** > **Hyperdrive**, create a configuration for the restricted `app` role in that staging database. Disable query caching, then run `packages/db/admin/bootstrap-staging-probe.sql` once as `migrator`. Keep its ID out of Git.
3. Create the exact `dayli-api-staging` Worker in the intended staging account. The protected workflow refuses a missing target rather than creating a default Worker.
4. Configure the protected GitHub `staging` Environment and run the manual workflow from `main`. It generates ignored `wrangler.staging.jsonc` and `wrangler.hyperdrive-test.jsonc`, synchronizes the reviewed Worker secret allowlist, and never puts secrets in `vars`, JSON configuration, or Git. Follow [the staging deployment guide](../../docs/implementation/staging-deployment.md).
5. The generated API configuration declares `HYPERDRIVE`, the native API rate-limit bindings, `USER_REALTIME`, its SQLite migration, and the retry cron. The generated test configuration has only the private service binding, so it cannot run scheduled work against staging data.

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

`.github/workflows/staging-hyperdrive.yml` can run after successful same-repository `main` CI or by manual dispatch from `main`. It has no pull request or `main` push trigger. The checked-in [hosted mutation hold](../../docs/implementation/hosted-mutation-hold.md) denies both paths until an owner explicitly authorizes a reviewed commit from live main history.

After provisioning, configure the full variable and secret allowlist in [the staging deployment guide](../../docs/implementation/staging-deployment.md). `STAGING_AUTH_SITE_HOST` is the reviewed shared parent hostname for the two distinct custom staging hosts, without a scheme or path. The workflow requires `main`, rejects localhost and platform-provided domains, checks both exact HTTPS origins, validates the exact service name and uncached Hyperdrive, and never targets the default `dayli-api` Worker. It synchronizes Worker secrets only after those checks. After the private tests pass, the GitHub runner writes sanitized evidence outside the Worker sandbox. It does not use `pull_request_target`.

`.github/workflows/cleanup-hyperdrive-preview.yml` is manual only and requires a PR number. It runs only from `main`, validates that GitHub reports the PR as closed, main-based, same-repository, and non-fork, then makes an idempotent, credential-guarded deletion attempt for exactly `dayli-api-pr-<number>`. It does not check out or execute PR code. The staging environment now has credentials and values for the manual API proof. That does not authorize preview cleanup, which remains a separate manual action limited to eligible closed PR workers. The old staging Worker and Hyperdrive were deleted; do not run cleanup against their replacements.
