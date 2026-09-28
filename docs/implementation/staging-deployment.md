# Staging API deployment

The API staging workflow is `.github/workflows/staging-hyperdrive.yml`. It runs only through manual dispatch from `main`. Its `staging` GitHub Environment must approve the job before it can read credentials, synchronize Worker secrets, or deploy.

This is not a PR deployment path. Do not add `push`, `pull_request`, or `pull_request_target` triggers. GitHub Environment rules are repository settings, not code. An owner must create the `staging` Environment, restrict it to `main`, require the designated external reviewers, dismiss stale approvals, and disable administrator bypass where policy allows. The repository cannot prove those settings exist.

## Data flow

```text
GitHub staging variables and secrets
  -> scripts/run-staging-api-deploy.mjs
  -> generated ignored Wrangler configuration and Cloudflare Worker secret API
  -> Wrangler deploy through the Cloudflare control plane
  -> Worker runtime bindings
```

The generated `apps/api/wrangler.staging.jsonc` has public variables only. It includes `HYPERDRIVE`, `USER_REALTIME`, the `UserRealtime` SQLite migration, and the one-minute retry cron. The Durable Object migration is a Worker migration. It is separate from PostgreSQL migrations, which must run through the reviewed database migration process before code needs their schema.

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
- `STAGING_PUSH_TOKEN_ENCRYPTION_KEY_VERSION` only when staging push is enabled

Set these `staging` Environment secrets:

- `CLOUDFLARE_API_TOKEN`, runner-only. The sync never copies this token to the Worker.
- `CLOUDFLARE_STAGING_HYPERDRIVE_ID`
- `BETTER_AUTH_SECRET`
- `GOOGLE_CLIENT_SECRET` when the Google variable tuple is set
- `RESEND_API_KEY` when `STAGING_RESEND_FROM` is set
- `FCM_SERVICE_ACCOUNT_JSON` and `PUSH_TOKEN_ENCRYPTION_KEY` together when push is enabled

The source names are an allowlist. The workflow does not accept arbitrary secret names, does not put a secret in Wrangler `vars`, does not write secret values to generated files or artifacts, and does not delete an absent optional Worker secret. It validates every required source secret before any Cloudflare mutation. It then bulk-upserts only the reviewed values. A failed bulk request stops deployment. Cloudflare secret changes are not transactional with a later code deployment, so inspect the Worker secret store and rerun the approved workflow after a sanitized failure. A changed secret can activate behavior in the currently deployed Worker before the code deployment completes. Keep configuration backward compatible and use the documented rollback procedure.

The Cloudflare token needs permission to read the named Hyperdrive, list and read the exact Worker, read Worker secret names and settings, bulk-update that Worker's secrets, and deploy that Worker. Do not grant production resources to this token.

## Deployment and verification

1. Apply reviewed PostgreSQL migrations through the database migration workflow when required.
2. Dispatch `Deploy staging API and Hyperdrive proof` from `main`.
3. Wait for the `staging` Environment owner approval.
4. The workflow validates exact origins, uncached named Hyperdrive, account ID, and the existing exact Worker before synchronizing secrets.
5. It generates ignored configuration, performs Wrangler dry runs for the API and proof Worker, deploys the API, and runs the private Hyperdrive check.
6. Inspect the sanitized proof artifact. It contains commit and tool version evidence only, never configuration or secrets.
7. Verify staging API health, auth, Durable Object connection behavior, and scheduled outbox repair with approved test accounts. Firebase and APNs physical-device delivery still need separate evidence.

A failed secret synchronization can leave some values updated. Do not claim code and secret updates are atomic. Stop, review the named staging Worker and the approved source values without printing them, then rerun only after the owner decides the state is safe.

## Push encryption key guard and recovery

`PUSH_TOKEN_ENCRYPTION_KEY` encrypts stored push tokens. Replacing it makes existing ciphertext unreadable. The generated public Worker metadata `PUSH_TOKEN_ENCRYPTION_KEY_VERSION` is the authoritative deployed version check. It is a version label, not a hash of the proposed GitHub secret.

When push is enabled, the workflow requires both push secrets and a valid version label. It reads the deployed Worker settings before any update. A mismatched version fails. An existing key with no version metadata also fails because the workflow cannot compare the proposed key with deployed material.

For a legacy Worker with an unversioned key, an external owner must verify that the approved GitHub value is the already deployed key. Only then may the owner dispatch with `push_key_owner_bootstrap=true` to establish the version metadata and synchronize the same value. Record that approval outside this repository. Do not use this switch for a key change.

A rotation needs a reviewed migration or backfill that can decrypt old token ciphertext and re-encrypt it under the new key, plus an approved rollback plan. After the backfill and verification, update the version metadata and secret in a controlled owner operation. This deployment workflow deliberately rejects a version mismatch rather than silently rotating data out from under existing ciphertext.

For a code rollback, keep the secret version and bindings compatible with the prior Worker. Do not delete the Durable Object migration or shared object namespace. If secrets changed before a failed deploy, restore only the reviewed prior secret values through an approved owner procedure, then deploy compatible code.
