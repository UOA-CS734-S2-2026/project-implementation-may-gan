# Staging API deployment

The API staging workflow is `.github/workflows/staging-hyperdrive.yml`. It runs only through manual dispatch from `main` and references the `staging` GitHub Environment before it can read credentials, synchronize Worker secrets, or deploy.

This is not a PR deployment path. Do not add `push`, `pull_request`, or `pull_request_target` triggers. GitHub Environment rules are repository settings, not code. An owner must restrict `staging` to `main`, require the designated external reviewers, dismiss stale approvals, and disable administrator bypass where policy allows. This checkout cannot verify those settings or claim that reviewer approval is currently enforced.

## Data flow

```text
GitHub staging variables and secrets
  -> scripts/run-staging-api-deploy.mjs validates and generates ignored Wrangler configuration
  -> Wrangler dry-runs
  -> scripts/sync-staging-api-secrets.mjs calls the Cloudflare Worker secret API
  -> Wrangler deploy through the Cloudflare control plane
  -> Worker runtime bindings
```

The generated `apps/api/wrangler.staging.jsonc` has public variables only. It includes `HYPERDRIVE`, the native rate-limit bindings, `API_RATE_LIMIT_SCOPE=staging`, `USER_REALTIME`, the `UserRealtime` SQLite migration, and the one-minute retry cron. The bindings and their separate read, write, message, media, realtime, and direct/push thresholds are versioned in source and generated with the staging Worker configuration. The scope prefixes keys so staging, local, and production never share an actor or ingress bucket. The Durable Object migration is a Worker migration. It is separate from PostgreSQL migrations, which must run through the reviewed database migration process before code needs their schema.

The generated Hyperdrive proof configuration exposes only the remote `HyperdriveIntegrationEntrypoint`. It has no cron, Durable Object binding, or migration. It cannot start scheduled delivery work against shared staging data.

`apps/api/wrangler.local.example.jsonc` uses the same Durable Object binding, migration, and retry cron for local development. `scripts/local-auth.sh` copies that template and writes local auth values only to ignored `.dev.vars`.

## Owner setup

Create the exact existing staging Worker named `dayli-api-staging` in the intended Cloudflare account before the first workflow run. The workflow refuses a missing or differently named target. Set `STAGING_API_SERVICE_NAME` to `dayli-api-staging`. It will not choose a default Worker or a production target.

Set these `staging` Environment variables:

- `CLOUDFLARE_ACCOUNT_ID`
- `STAGING_API_SERVICE_NAME`, exactly `dayli-api-staging`
- `STAGING_HYPERDRIVE_NAME`
- `STAGING_AUTH_SITE_HOST`
- `STAGING_AUTH_API_ORIGIN`
- `STAGING_AUTH_WEB_ORIGIN`
- `STAGING_GOOGLE_WEB_CLIENT_ID`, `STAGING_GOOGLE_IOS_CLIENT_ID`, and `STAGING_GOOGLE_ANDROID_CLIENT_ID` together, or leave all three blank
- `STAGING_RESEND_FROM` only when Resend is enabled
- `STAGING_R2_BUCKET_NAME` only when media uploads are enabled (see [media reservations](../dayli/media-reservations.md#one-time-cloudflare-setup)); the Worker's `R2_ACCOUNT_ID` is `CLOUDFLARE_ACCOUNT_ID`

Set these `staging` Environment secrets:

- `CLOUDFLARE_API_TOKEN`, runner-only. The sync never copies this token to the Worker.
- `CLOUDFLARE_STAGING_HYPERDRIVE_ID`
- `BETTER_AUTH_SECRET`
- `GOOGLE_CLIENT_SECRET` when the Google variable tuple is set
- `RESEND_API_KEY` when `STAGING_RESEND_FROM` is set
- `FCM_SERVICE_ACCOUNT_JSON` when push delivery is enabled
- `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` together when `STAGING_R2_BUCKET_NAME` is set. This is a bucket-scoped R2 API token, separate from `CLOUDFLARE_API_TOKEN`. The workflow uses these keys to list the bucket before deploying, so `CLOUDFLARE_API_TOKEN` needs no R2 permission.

Provision `PUSH_TOKEN_ENCRYPTION_KEY` directly in the Cloudflare staging Worker secret store. Never add it to GitHub, workflow inputs, or routine secret sync.

The source names are an allowlist. The workflow does not accept arbitrary secret names, does not put a secret in Wrangler `vars`, does not write secret values to generated files or artifacts, and does not delete an absent optional Worker secret. It validates every required source secret, the public provider pairing, and the existing Cloudflare push-key prerequisite before any mutation. It uses Cloudflare's `PATCH .../secrets-bulk` API to upsert only reviewed auth, email, R2, and optional FCM values. The push key is omitted from every routine request. A failed bulk request or a failed readback of the requested secret binding names stops deployment. Cloudflare may include other existing bindings in a successful bulk response, so the workflow uses its success flag and verifies the requested names in a separate list call. List responses do not expose secret values. Cloudflare secret changes are not transactional with a later code deployment, so inspect the Worker secret store and rerun the approved workflow after a sanitized failure. A changed auth, email, or FCM secret can activate behavior in the currently deployed Worker before the code deployment completes. Keep configuration backward compatible and use the documented rollback procedure.

The Cloudflare token needs permission to read the named Hyperdrive, list and read the exact Worker, read Worker secret names and settings, bulk-update that Worker's secrets, and deploy that Worker. Do not grant production resources to this token.

## Deployment and verification

1. Apply reviewed PostgreSQL migrations through the database migration workflow when required.
2. Dispatch `Deploy staging API and Hyperdrive proof` from `main`.
3. Wait for the `staging` Environment owner approval.
4. The workflow validates exact origins, uncached named Hyperdrive, account ID, the existing exact Worker, and the projected public-secret pairing.
5. It generates ignored configuration and performs Wrangler dry runs for the API and proof Worker before it synchronizes secrets.
6. It synchronizes reviewed secrets, deploys the API, and runs the private Hyperdrive check.
7. Inspect the sanitized proof artifact. It contains commit and tool version evidence only, never configuration or secrets.
8. Verify staging API health, auth, Durable Object connection behavior, and scheduled outbox repair with approved test accounts. Firebase and APNs physical-device delivery still need separate evidence.

A failed secret synchronization can leave some values updated. Do not claim code and secret updates are atomic. Stop, review the named staging Worker and the approved source values without printing them, then rerun only after the owner decides the state is safe.

## Push encryption key provisioning and recovery

`PUSH_TOKEN_ENCRYPTION_KEY` encrypts stored push tokens. Replacing it makes existing ciphertext unreadable. It is a Cloudflare-only Worker secret and this workflow never reads, writes, deletes, fingerprints, or versions it.

Before enabling `FCM_SERVICE_ACCOUNT_JSON`, an owner must provision the push key directly on the exact `dayli-api-staging` Worker. Generate a new key only for a new Worker with:

```bash
openssl rand -base64 32
```

Store the single output as `PUSH_TOKEN_ENCRYPTION_KEY` in Cloudflare. It encodes exactly 32 random bytes. Do not print it in tickets, paste it into GitHub, or use this command against an existing Worker. The workflow checks only that the Worker has a secret with this binding name before it accepts FCM synchronization. It cannot inspect or validate the secret value.

For an existing Worker, keep its current key. A rotation needs a reviewed migration or backfill that can decrypt old token ciphertext and re-encrypt it under the new key, plus an approved rollback plan. Perform that Cloudflare-only operation separately from this workflow, verify the backfill, and retain the old value until recovery is complete. For a code rollback, keep the Worker key and bindings compatible with the prior code. Do not delete the Durable Object migration or shared object namespace.
