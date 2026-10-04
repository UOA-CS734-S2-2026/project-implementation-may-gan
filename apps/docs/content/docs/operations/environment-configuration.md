---
title: Environment configuration
description: Where staging variables, secrets, and Worker bindings live, how deployment moves them, and how to inspect or rotate them safely.
---

# Environment configuration

Dayli's staging configuration does not live in one env file. GitHub holds deployment inputs, workflows validate and transform them, and Cloudflare Workers receive only the settings and bindings they need at runtime. Provider-managed resources such as Hyperdrive and R2 add another layer.

That separation limits where credentials can appear, but it also makes a missing setting harder to trace. Start with the name in GitHub, find the workflow or script that consumes it, then check its runtime destination. Do not copy every value into a local file to make the system easier to inspect.

This page records the configuration names observed on 4 October 2026. It documents names and binding types, not secret values. A binding's presence proves only that the name exists. It does not prove that the value is current, that a provider accepts it, or that the service works.

For local files and the difference between local and staging, read [Environments](/docs/development/environments). Authentication provider setup and cookie-origin rules are in [Authentication setup and operations](/docs/systems/accounts-and-authentication/setup-and-operations).

## The four configuration layers

1. **GitHub environment variables** hold non-secret deployment inputs for the protected `staging` environment.
2. **GitHub environment secrets** hold credentials and opaque resource IDs used by Actions. Some stay in CI, while the approved sync copies a smaller set into the API Worker secret store.
3. **Generated and checked-in Worker configuration** turns deployment inputs into plaintext Worker variables, resource bindings, and public web build settings.
4. **Provider-managed resources** hold data and connection credentials outside the Worker secret list. A Hyperdrive binding, for example, names a managed Hyperdrive configuration. Its database credentials do not become Worker secrets.

A GitHub value and its runtime destination may have different names. `STAGING_RESEND_FROM`, for example, becomes the API Worker variable `RESEND_FROM`. `STAGING_AUTH_API_ORIGIN` is used both as a Worker variable source and as the public `NEXT_PUBLIC_API_BASE_URL` compiled into the web bundle.

Values beginning with `NEXT_PUBLIC_` are public build inputs. They must never contain passwords, API keys, or private tokens. The staging web Worker currently has no Worker secrets, although its client bundle contains public compile-time configuration.

## GitHub `staging` environment variables

The protected GitHub environment contained these 12 variables. GitHub Actions reads them through the `vars` context.

| Variable | Purpose and source | Consumer | Destination |
| --- | --- | --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Identifies the Cloudflare account selected by an owner during environment provisioning. It is an identifier, not an API credential. | API and web deployment validation, Hyperdrive checks, and Wrangler | CI target selection. It also becomes API Worker `R2_ACCOUNT_ID` when R2 is configured. |
| `STAGING_API_SERVICE_NAME` | Pins the expected API service name. The deployment script accepts only `dayli-api-staging`. | `staging-hyperdrive.yml`, `run-staging-api-deploy.mjs`, and `sync-staging-api-secrets.mjs` | CI-only target guard. |
| `STAGING_AUTH_API_ORIGIN` | Exact public HTTPS API origin chosen for staging. | API config generation and the web build | API Worker `PUBLIC_API_BASE_URL`, part of `BETTER_AUTH_TRUSTED_ORIGINS`, and public web `NEXT_PUBLIC_API_BASE_URL`. It is also `BETTER_AUTH_BASE_URL` in direct mode. |
| `STAGING_AUTH_SITE_HOST` | Expected staging site host used to reject unrelated or malformed origins. | `staging-origins.mjs` in API and web deployment validation | CI-only validation input. |
| `STAGING_AUTH_WEB_ORIGIN` | Exact public HTTPS web origin chosen for staging. | API config generation and the web build | Part of API Worker `BETTER_AUTH_TRUSTED_ORIGINS`, public web `NEXT_PUBLIC_WEB_API_BASE_URL`, and `BETTER_AUTH_BASE_URL` in proxy mode. |
| `STAGING_BROWSER_PROXY_ENABLED` | Reviewed release switch. It must be `true` or `false`. | The release capture, API deployment, and web deployment workflows | Selects the API's Better Auth base URL and compiles public `NEXT_PUBLIC_WEB_API_PROXY_ENABLED` into the web build. |
| `STAGING_GOOGLE_ANDROID_CLIENT_ID` | Public Android OAuth client ID from the staging Google project. All three Google client IDs must be present together. | `staging-auth-bindings.mjs` | API Worker `GOOGLE_ANDROID_CLIENT_ID`. |
| `STAGING_GOOGLE_IOS_CLIENT_ID` | Public iOS OAuth client ID from the staging Google project. | `staging-auth-bindings.mjs` | API Worker `GOOGLE_IOS_CLIENT_ID`. |
| `STAGING_GOOGLE_WEB_CLIENT_ID` | Public web OAuth client ID from the staging Google project. | `staging-auth-bindings.mjs` | API Worker `GOOGLE_WEB_CLIENT_ID`. |
| `STAGING_HYPERDRIVE_NAME` | Expected name of the owner-provisioned staging Hyperdrive configuration. | `run-staging-api-deploy.mjs` | CI-only identity and caching check. |
| `STAGING_R2_BUCKET_NAME` | Name of the owner-provisioned staging media bucket. | `staging-media-bindings.mjs` and its access preflight | API Worker `R2_BUCKET_NAME`. |
| `STAGING_RESEND_FROM` | Public sender identity from the staging Resend setup. | `staging-auth-bindings.mjs` | API Worker `RESEND_FROM`. |

Sources: `.github/workflows/staging-release.yml`, `.github/workflows/staging-hyperdrive.yml`, `.github/workflows/staging-web.yml`, `scripts/run-staging-api-deploy.mjs`, `scripts/staging-auth-bindings.mjs`, `scripts/staging-media-bindings.mjs`, and `scripts/staging-worker-config.mjs`.

## GitHub `staging` environment secrets

The protected environment contained these 11 secret names. GitHub does not expose their values through the listing API, and values were not compared with Cloudflare.

| Secret | Purpose and provisioning source | Consumer | Destination |
| --- | --- | --- | --- |
| `BETTER_AUTH_SECRET` | Better Auth signing secret generated for staging. | API configuration validation and approved secret sync | API Worker secret `BETTER_AUTH_SECRET`. Changing it invalidates existing signed sessions. |
| `CLOUDFLARE_API_TOKEN` | Least-privilege deployment token created in Cloudflare. It is control-plane access, not an application secret. | Wrangler deployments, Cloudflare validation, and secret sync | CI-only. It must not be copied into any Worker. |
| `CLOUDFLARE_STAGING_EXPORT_WORKER_HYPERDRIVE_ID` | Opaque ID of the separately provisioned, restricted export Hyperdrive configuration. | The newer `origin/main` workflow `verify-staging-export-worker.yml` | CI-only read-only target verification. The observed Workers had no standalone export Worker, and the observed API bindings did not include `EXPORT_WORKER_HYPERDRIVE`. |
| `CLOUDFLARE_STAGING_HYPERDRIVE_ID` | Opaque ID of the ordinary app Hyperdrive configuration. | Schema-target verification and API config generation | API resource binding `HYPERDRIVE`. The managed app-role database credentials remain in Hyperdrive, outside the Worker secret list. |
| `DATABASE_URL` | Direct, unpooled staging `migrator` URL provisioned from the database provider. | Migration planning, application, verification, and database-target checks | CI-only. It must never be added to the API Worker or a web build. |
| `GOOGLE_CLIENT_SECRET` | Web OAuth client secret from the staging Google project. | Approved secret sync when all Google client IDs are configured | API Worker secret `GOOGLE_CLIENT_SECRET`. |
| `R2_ACCESS_KEY_ID` | Bucket-scoped S3 credential created for the staging media bucket. | R2 access preflight and approved secret sync | API Worker secret `R2_ACCESS_KEY_ID`. |
| `R2_SECRET_ACCESS_KEY` | Secret half of the bucket-scoped S3 credential. | R2 access preflight and approved secret sync | API Worker secret `R2_SECRET_ACCESS_KEY`. |
| `RESEND_API_KEY` | API key created in the team-owned staging Resend setup. | Approved secret sync when `STAGING_RESEND_FROM` is configured | API Worker secret `RESEND_API_KEY`. |
| `SMOKE_TEST_EMAIL` | Credentials for the staging-only browser smoke account. | `staging-auth-smoke.yml` | CI-only browser test input. |
| `SMOKE_TEST_PASSWORD` | Password for the same staging-only smoke account. | `staging-auth-smoke.yml` | CI-only browser test input. |

Sources: `.github/workflows/staging-hyperdrive.yml`, `.github/workflows/staging-auth-smoke.yml`, `.github/workflows/run-database-migrations.yml`, `scripts/staging-secret-sync.mjs`, and `origin/main:.github/workflows/verify-staging-export-worker.yml`. The checked-out `staging-hyperdrive.yml` does not consume the export Hyperdrive ID. The newer workflow on `origin/main` does, so the secret is not unused. That workflow only verifies that the restricted, uncached Hyperdrive reaches the same database through the `lifecycle_worker` role. It does not bind a Worker or enable exports.

## Repository-level configuration

No repository-level secrets were observed. One repository-level Actions variable was present:

| Variable | Why it is repository-level | Consumer |
| --- | --- | --- |
| `STAGING_AUTH_SMOKE_AUTOMATION_ENABLED` | A job-level condition runs before GitHub makes protected environment variables available. The flag allows scheduled and post-release smoke runs only when its value is `true`. | `.github/workflows/staging-auth-smoke.yml` |

The flag controls automatic entry points. A manual smoke run from `main` does not depend on it. Its value was not inspected during the inventory.

## Effective Cloudflare Worker bindings

The account inventory contained three Workers. The tables below list only observed names and binding types.

### `dayli-api-staging`

Worker secrets:

- `BETTER_AUTH_SECRET`
- `GOOGLE_CLIENT_SECRET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `RESEND_API_KEY`

Plaintext variables:

- `API_RATE_LIMIT_SCOPE`
- `BETTER_AUTH_BASE_URL`
- `BETTER_AUTH_TRUSTED_ORIGINS`
- `GOOGLE_ANDROID_CLIENT_ID`
- `GOOGLE_IOS_CLIENT_ID`
- `GOOGLE_WEB_CLIENT_ID`
- `PUBLIC_API_BASE_URL`
- `R2_ACCOUNT_ID`
- `R2_BUCKET_NAME`
- `RESEND_FROM`

Resource bindings:

| Binding | Type or target |
| --- | --- |
| `HYPERDRIVE` | Hyperdrive |
| `USER_REALTIME` | Durable Object namespace |
| `API_DIRECT_PUSH_RATE_LIMIT` | Rate limit |
| `API_INGRESS_RATE_LIMIT` | Rate limit |
| `API_MEDIA_RATE_LIMIT` | Rate limit |
| `API_MESSAGE_RATE_LIMIT` | Rate limit |
| `API_READ_RATE_LIMIT` | Rate limit |
| `API_REALTIME_RATE_LIMIT` | Rate limit |
| `API_WRITE_RATE_LIMIT` | Rate limit |

The current secret sync code also knows about optional `FCM_SERVICE_ACCOUNT_JSON` and owner-managed `PUSH_TOKEN_ENCRYPTION_KEY`. Neither name was present in the observed GitHub environment or API Worker secret list. Push delivery should therefore be treated as unconfigured in this snapshot, not as a feature that was tested and found working. The sync refuses to add FCM unless the owner-managed encryption key already exists.

### `dayli-web-staging`

This Worker had no secrets. Its bindings were:

| Binding | Type or target |
| --- | --- |
| `ASSETS` | Assets |
| `API_BROWSER_PROXY` | Service binding to `dayli-api-staging`, entrypoint `BrowserProxyEntrypoint` |

The public API origins and proxy flag are compiled during `staging-web.yml`. They are not Worker secrets and changing a GitHub variable does not rewrite an already deployed browser bundle.

### `dayli-docs`

This Worker had no secrets. Its bindings were:

| Binding | Type or target |
| --- | --- |
| `ASSETS` | Assets |
| `IMAGES` | Images |
| `WORKER_SELF_REFERENCE` | Service binding to `dayli-docs` |

Only these three Workers were present in the observed account listing. There was no standalone export Worker. The separate export Hyperdrive secret and its verification workflow are preparation, not evidence that export execution is deployed. On newer `main`, the API also requires an `EXPORT_WORKER_HYPERDRIVE` binding and a release gate before export execution becomes available. This guide deliberately does not provide an enablement recipe for that unfinished path.

## How staging deployment moves configuration

The coordinated release starts in `.github/workflows/staging-release.yml`. It captures one commit and one browser-proxy mode, then runs the API stage before the web stage.

For the API, `scripts/run-staging-api-deploy.mjs` validates the account, Worker name, origins, Hyperdrive identity, provider tuples, R2 access, and existing secret names. `scripts/staging-worker-config.mjs` then writes generated Wrangler configuration without embedding secrets. After dry runs, `scripts/sync-staging-api-secrets.mjs` copies only its reviewed allowlist to the API Worker. Wrangler deploys the generated configuration last.

The sync is not a general GitHub-to-Cloudflare mirror. It currently allows Better Auth, Google, Resend, R2, and optional FCM secrets. It deliberately leaves `PUSH_TOKEN_ENCRYPTION_KEY` under direct owner control because replacing that key makes existing encrypted push tokens unreadable.

For the web app, `staging-web.yml` compiles the three `NEXT_PUBLIC_` settings and deploys the Worker with its assets and API service binding. No secret is needed by the web runtime.

`DATABASE_URL` stays in the workflow because migrations need a direct `migrator` connection. The application uses the restricted app connection managed inside Hyperdrive. These are different credentials with different permissions.

## Provision or change a setting

Do not begin by editing a generated `wrangler.staging.jsonc` file. It is an output of the deployment script.

1. Identify the owning system. Public origins and service names belong in GitHub environment variables. Credentials belong in GitHub environment secrets. Buckets, OAuth clients, database roles, and Hyperdrive configurations must first exist in their providers.
2. Check the consumer and destination in the tables above. A CI-only secret must remain CI-only.
3. Provision the smallest provider grant that works. R2 keys should be bucket-scoped. Deployment tokens should have only the control-plane permissions used by the workflows. Database roles must keep `migrator`, app, and restricted lifecycle work separate.
4. Update the protected `staging` environment through the approved repository settings process. Do not paste values into an issue, terminal transcript, workflow output, or committed env file.
5. Run the workflow that owns the setting. Runtime API and web changes go through the coordinated staging release. The smoke credentials belong to the authentication smoke workflow. The restricted export Hyperdrive has a read-only verification workflow on newer `main`.
6. Verify names first, then run a focused service check. Name presence alone is not a health check.

Provider tuples must remain complete. Google needs all three public client IDs and `GOOGLE_CLIENT_SECRET`. Resend needs `STAGING_RESEND_FROM` and `RESEND_API_KEY`. R2 needs the bucket name and both S3 credential parts. The deployment scripts reject incomplete pairs rather than deploying a partly configured API.

## Rotation runbook

Rotation order depends on the credential. Do not rotate every item with one generic procedure.

### Provider keys with overlap

Google, Resend, R2, and the Cloudflare deploy token should use an overlap when the provider supports two active credentials:

1. Create a new least-privilege credential at the provider without revoking the old one.
2. Replace the matching GitHub `staging` secret.
3. Run the owning deployment or verification workflow.
4. Check the affected operation without printing the credential. For R2, the deployment preflight checks bucket access. For Google or Resend, use the focused authentication checks in the auth operations guide.
5. Revoke the old provider credential only after the new path succeeds.

For `CLOUDFLARE_API_TOKEN`, the token is CI-only. Confirm the coordinated release can complete before revoking the old token. Never add it to Worker secrets.

### Better Auth secret

Changing `BETTER_AUTH_SECRET` invalidates signed sessions. Plan for users to sign in again. Replace the protected GitHub secret, run the coordinated release, and test a new sign-in. Do not rotate it merely to change browser proxy mode or recover a deployment.

### Database and Hyperdrive credentials

Rotate the direct `migrator` credential and the application connection separately.

- `DATABASE_URL` is the workflow's direct migrator URL. Update it in GitHub, then run the target and migration verification before retiring the old credential.
- Application credentials belong to the provider-managed `HYPERDRIVE` configuration. Follow the database and Hyperdrive provider procedure, preserve the restricted app role, and use the schema-target check to confirm identity. Do not copy the app URL into GitHub as `DATABASE_URL`.
- The export Hyperdrive uses the separate restricted `lifecycle_worker` role. Its ID must differ from the ordinary app Hyperdrive ID. Use the read-only export target workflow on a checkout that contains it. Do not infer that the export feature is enabled from a successful connection check.

### Smoke account

Change the staging test account and `SMOKE_TEST_EMAIL` or `SMOKE_TEST_PASSWORD` together, then run the manual authentication smoke. These credentials are for the test account only, not a general team login.

### Push secrets

`PUSH_TOKEN_ENCRYPTION_KEY` is intentionally not synchronized from GitHub. Replacing it makes existing encrypted push-token ciphertext unreadable. Stop and use a reviewed data and key migration plan rather than `wrangler secret put` as a routine rotation.

`FCM_SERVICE_ACCOUNT_JSON` may be synchronized only after the encryption key exists. Both names were absent in the observed staging snapshot. Do not add either one just to make a name check pass.

## Safe read-only audit

Run metadata checks from the repository root. Replace `<owner>/<repo>` with the repository name. These commands print names only.

```bash
# Protected environment variable names
gh api --paginate \
  'repos/<owner>/<repo>/environments/staging/variables?per_page=100' \
  --jq '.variables[].name'

# Protected environment secret names. GitHub never returns their values.
gh api --paginate \
  'repos/<owner>/<repo>/environments/staging/secrets?per_page=100' \
  --jq '.secrets[].name'

# Repository-level variable names and secret names
gh api --paginate 'repos/<owner>/<repo>/actions/variables?per_page=100' \
  --jq '.variables[].name'
gh api --paginate 'repos/<owner>/<repo>/actions/secrets?per_page=100' \
  --jq '.secrets[].name'
```

List Worker secret metadata with the repository's Wrangler version. Do not use provider dashboards or commands that reveal values, and do not print raw settings payloads.

```bash
pnpm --dir apps/api exec wrangler secret list --name dayli-api-staging
pnpm --dir apps/web exec wrangler secret list --name dayli-web-staging
pnpm --dir apps/docs exec wrangler secret list --name dayli-docs
```

Review generated configuration logic without generating a secrets file:

```bash
git grep -n 'secrets\.' -- .github/workflows
git grep -n 'process.env' -- scripts/run-staging-api-deploy.mjs scripts/sync-staging-api-secrets.mjs
git show origin/main:.github/workflows/verify-staging-export-worker.yml
```

Do not print `gh auth token`, shell environment dumps, raw Worker settings responses, database URLs, or secret values. Do not reconstruct a complete env file from this inventory.

## Interpreting the result

Use three separate conclusions:

- **Configured by name** means the metadata list contains the expected name.
- **Projected to runtime** means the deployment code maps that source to a Worker variable, secret, build value, or resource binding.
- **Working** requires the relevant preflight or service check.

A successful secret-name listing cannot detect an expired Google secret, a revoked R2 key, the wrong value under the right name, or a broken OAuth callback. It also cannot compare a GitHub secret with a Worker secret because neither service exposes the stored plaintext. Verify behavior through the owning workflow and focused service checks instead of trying to recover or compare secret contents.
