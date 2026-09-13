# Dayli API

## Staging Hyperdrive check

`test:hyperdrive:staging` proves the deployed staging Worker can use its `HYPERDRIVE` binding. The test runs in the Workers Vitest runtime, reaches the deployed Worker through a remote Worker service binding, and calls the non-HTTP `HyperdriveIntegrationEntrypoint`. That entrypoint creates a Drizzle client from `env.HYPERDRIVE`, runs `select 1 as ok`, checks `{ ok: 1 }`, and closes the client in `finally`.

It does not add a health route or an OpenAPI operation. A public request cannot call a `WorkerEntrypoint`; only a Worker with a configured service binding can call it.

The ordinary API test configuration excludes `*.staging.test.ts`. The staging command needs an ignored Wrangler configuration and Cloudflare credentials, so it cannot run in ordinary or untrusted pull-request tests.

### One-time Cloudflare setup

1. Create a PostgreSQL database used only for staging. Do not reuse production data or credentials. Create a least-privilege database user and require TLS according to the provider's requirements.
2. In the Cloudflare dashboard, go to **Workers & Pages** > **Hyperdrive** and create a configuration for that staging database. Enter the database connection details only in Cloudflare. Disable query caching. Keep the resulting Hyperdrive ID out of Git.
3. Copy `wrangler.staging.example.jsonc` to the ignored `wrangler.staging.jsonc`. Replace only the two placeholders with the staging Worker service name and Hyperdrive ID. Keep the binding name `HYPERDRIVE`.
4. Authenticate Wrangler with an account token permitted to deploy that staging Worker, then deploy it:

   ```bash
   pnpm --dir apps/api exec wrangler deploy --config wrangler.staging.jsonc
   ```

   This deploy is what gives the staging Worker its real `env.HYPERDRIVE` binding. The deploy command does not create the Hyperdrive configuration or its database.
5. Copy `wrangler.hyperdrive-test.example.jsonc` to the ignored `wrangler.hyperdrive-test.jsonc`. Set its service placeholder to the same staging Worker service name. This file declares a remote service binding to the private test entrypoint. It contains no database connection string.

### Run the check

Run this only from a trusted machine or the protected staging workflow, with a Cloudflare API token and account ID available to Wrangler:

```bash
CLOUDFLARE_ACCOUNT_ID="..." CLOUDFLARE_API_TOKEN="..." \
  pnpm --filter @dayli/api test:hyperdrive:staging
```

The command sends no database connection string to the test process. This check uses a remote Worker service binding rather than a local Hyperdrive simulation. The query runs inside the deployed staging Worker, where Cloudflare supplies the real Hyperdrive connection string.

Record only the command, commit SHA, date, runtime versions, and pass/fail result. Do not record configuration IDs, database hosts, connection strings, credentials, or query logs.

### Protected GitHub workflow

`.github/workflows/staging-hyperdrive.yml` is manual-only and uses the GitHub `staging` environment. Before dispatching it, configure that environment with required reviewers and add:

- secret `CLOUDFLARE_API_TOKEN`, scoped to deploy the staging Worker and use its remote service binding;
- secret `CLOUDFLARE_STAGING_HYPERDRIVE_ID`;
- variable `CLOUDFLARE_ACCOUNT_ID`;
- variable `STAGING_API_SERVICE_NAME`.

The workflow writes ignored Wrangler files on the runner, deploys the staging Worker with `HYPERDRIVE`, then runs the integration test. It has no `pull_request` trigger. Do not move these values to repository-level variables or secrets that untrusted workflows can read.
