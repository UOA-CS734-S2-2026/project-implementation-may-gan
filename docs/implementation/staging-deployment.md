# Staging API deployment

`.github/workflows/staging-release.yml` is the only staging deployment entry point. It runs after successful CI on `main` or through manual dispatch from `main`. The automatic path proceeds only when the successful CI commit still equals the fetched `main` tip at capture time. A manual dispatch without `commit_sha` has the same requirement. The optional `commit_sha` input selects a reviewed commit that remains in `main` history, but its staging migration history must exactly match that commit. It validates one `STAGING_BROWSER_PROXY_ENABLED` value from the `staging` environment, then calls the API workflow, waits for its deployment and Hyperdrive proof, and only then calls the web workflow with those same captured inputs. The API and web reusable workflows have no independent dispatch or CI triggers. This capture-time check cannot cancel a deployment that has already passed capture.

The release captures `github.workflow_sha` as an immutable tooling commit. API and web still check out the selected application commit at the repository root. They check out the workflow revision separately as `deployment-tooling` for the identity verifier, migration verifier, and historical web logging overlay. GitHub resolves same-repository reusable workflows from the caller workflow's commit, so this SHA identifies the reviewed workflow revision rather than a floating `main` checkout. A historical rollback must still meet the original coordinated-deployment baseline: its application must build with its checked-in lockfile and support the staged API and web deployment contract. This workflow does not bootstrap releases from before that baseline.

This is not a PR deployment path. Do not add `push`, `pull_request`, or `pull_request_target` triggers. GitHub Environment rules are repository settings, not code. An owner must restrict `staging` to `main`, require the designated external reviewers, dismiss stale approvals, and disable administrator bypass where policy allows. This checkout cannot verify those settings or claim that reviewer approval is currently enforced.

## Data flow

```text
GitHub staging `DATABASE_URL` with direct `migrator` access
  -> read-only Cloudflare Hyperdrive lookup compares host, database, and port with the direct target
  -> pnpm db:check and pnpm db:plan validate the captured forward release
  -> 0023 or 0024 pending: read-only five-table size preflight checks the combined 16 MiB staging cap
  -> pnpm db:migrate repeats each pending migration's locked check after final table locks, then applies the reviewed pending suffix
  -> pnpm db:verify compares applied migration hashes with the captured release checkout in a read-only transaction
  -> scripts/run-staging-api-deploy.mjs validates and generates ignored Wrangler configuration
  -> Wrangler dry-runs
  -> scripts/sync-staging-api-secrets.mjs calls the Cloudflare Worker secret API
  -> Wrangler deploy through the Cloudflare control plane
  -> Worker runtime bindings
```

The generated `apps/api/wrangler.staging.jsonc` has public variables only. It includes `HYPERDRIVE`, the native rate-limit bindings, `API_RATE_LIMIT_SCOPE=staging`, `USER_REALTIME`, the `UserRealtime` SQLite migration, and the one-minute retry cron. The bindings and their separate read, write, message, media, realtime, and direct/push thresholds are versioned in source and generated with the staging Worker configuration. The scope prefixes keys so staging, local, and production never share an actor or ingress bucket. The Durable Object migration is a Worker migration. It is separate from PostgreSQL migrations, which must run through the reviewed database migration process before code needs their schema.

The staging web Worker enables Workers observability and invocation logs in `apps/web/wrangler.jsonc`. For a historical compatible rollback whose source predates that setting, trusted tooling updates only the generated Vinext Worker configuration before validation and deployment. It never rewrites the selected release's source checkout. The workflow rejects generated output that disables either setting.

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
- `STAGING_BROWSER_PROXY_ENABLED`, `false` by default. Only `true` or `false` are accepted. Do not set `true` until the approved service-binding, source-IP, cookie, and OAuth proof is recorded.
- `STAGING_GOOGLE_WEB_CLIENT_ID`, `STAGING_GOOGLE_IOS_CLIENT_ID`, and `STAGING_GOOGLE_ANDROID_CLIENT_ID` together, or leave all three blank
- `STAGING_RESEND_FROM` only when Resend is enabled
- `STAGING_R2_BUCKET_NAME` only when media uploads are enabled (see [media reservations](../dayli/media-reservations.md#one-time-cloudflare-setup)); the Worker's `R2_ACCOUNT_ID` is `CLOUDFLARE_ACCOUNT_ID`

Set these `staging` Environment secrets:

- `DATABASE_URL`, the existing direct, unpooled staging `migrator` URL. The schema gate reads it only in the runner. Do not use the `app` Hyperdrive credential, place this URL in Worker configuration, or add a second secret for the gate.
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

1. Let `Deploy coordinated staging release` run after successful `main` CI, or dispatch it from `main` without `commit_sha`.
2. Wait for the `staging` Environment owner approval.
3. The API job checks out the captured application commit and the separate immutable tooling commit. The trusted tooling reads the configured Hyperdrive by its fixed secret ID, and compares its direct Neon host, database, and port with `DATABASE_URL`. It accepts `migrator` for the direct connection and requires `app` for Hyperdrive. It rejects pooler hosts, absent origin fields, or a mismatch without logging the connection string, hostname, database name, or port.
4. A forward release runs `pnpm db:check`, then `pnpm db:plan`. When `0024_lying_eddie_brock` is pending, the protected read-only preflight requires known migrator, app, and lifecycle roles, all five messaging tables, a known prefix ledger, and a combined 16 MiB maximum from `pg_total_relation_size`. It runs bounded transaction-local lock, statement, and idle-in-transaction timeouts before any metadata query. It fails closed before `db:migrate` for any unknown state, query failure, timeout, or cap breach. If both `0023` and `0024` are pending, the same preflight runs before the reviewed suffix and each migration performs its own locked recheck. Its Actions output reports only table and combined size categories plus the fixed cap, never byte counts.
5. `0024` locks `user` in `SHARE ROW EXCLUSIVE` mode first. That blocks signup, profile, account, and deletion writes for the migration transaction. It then holds final `ACCESS EXCLUSIVE` locks on the five messaging tables before it repeats the cap check and replaces foreign keys or builds constraints and indexes. This locked check closes the interval between the read-only preflight and migration. The configured five minute statement timeout applies per statement, not to the entire transaction. A breach aborts the migration transaction before partial data or schema changes commit.
6. It applies only the reviewed pending suffix and uses `pnpm db:verify` to compare the captured commit's ordered migration hashes with staging in a read-only transaction. These checks must pass before configuration generation, secret synchronization, either Worker deployment, the private proof, or web deployment.
7. A staging size-cap failure does not authorize a direct apply or a staging cap override. Record only sanitized categories and the fixed-cap outcome, choose a reviewed rollout change, and rerun the protected release. Production remains manual. Its optional `production_messaging_0024_size_cap_bytes` dispatch input is an explicit reviewed five-table byte cap, production-only, and never lowers the 16 MiB floor. A changed hash, unknown, or newer record requires a compatible release or a reviewed forward fix. Do not perform a destructive downgrade.
7. The workflow validates exact origins, uncached named Hyperdrive, account ID, the existing exact Worker, and the projected public-secret pairing.
8. It generates ignored configuration and performs Wrangler dry runs for the API and proof Worker before it synchronizes secrets. A main-only manual dispatch can set `push_readiness` to `true` to run the OAuth-only push readiness check at this point. The default is `false`, and automatic CI-triggered releases always keep it false. The check writes a sanitized artifact with the candidate commit, timestamp, outcome, pass value, and fixed check categories. Missing source credentials produce a no-push `skipped` result with `pass: false`, so it cannot count as #141 readiness evidence. It does not send an FCM message or establish device or deployed-release evidence.
9. It synchronizes reviewed secrets, deploys the API, and runs the private Hyperdrive check.
10. Inspect the sanitized proof artifact. It contains commit and tool version evidence only, never configuration or secrets.
11. Verify staging API health, auth, Durable Object connection behavior, and scheduled outbox repair with approved test accounts. Firebase and APNs physical-device delivery still need separate evidence.

A failed API stage stops the web stage. A failed web stage can leave the new API version active, so this is not transactional or zero-downtime. Restore a coherent prior release by setting `STAGING_BROWSER_PROXY_ENABLED` to the prior mode, then dispatching the coordinated workflow from main with the exact reviewed prior 40-character commit SHA. The workflow accepts only commits still reachable from main and only when staging has the same ordered migration hashes as that checkout. It rejects an older rollback release after a newer migration has reached staging, even when the old application code could appear compatible. Use a reviewed forward fix or a release with matching schema history instead. Do not restore the database or bypass the gate to force a historical Worker deploy. Retest browser sign-in afterward. Do not deploy web alone to recover a mode transition.

The staging API job and the staging branch of the manual migration workflow share one GitHub Actions concurrency group. That prevents a normal workflow migration from starting after the gate and before the API proof finishes. The lock ends before the dependent web job starts. GitHub Actions keeps at most one pending run per concurrency group and a newer request replaces an older pending request, so do not assume queued staging migrations or releases run in FIFO order. It does not prevent an owner or break-glass actor from changing the database outside Actions, and it does not continuously prove the schema after the locked migration check. Do not claim that this gate protects against out-of-band DDL or changes after the workflow ends.

A failed secret synchronization can leave some values updated. Do not claim code and secret updates are atomic. Stop, review the named staging Worker and the approved source values without printing them, then rerun only after the owner decides the state is safe. Omitting `FCM_SERVICE_ACCOUNT_JSON` from GitHub does not delete an existing Worker binding or disable an already deployed push path. Use the server-side notification feature flag for rollback once that flag is available.

## Push encryption key provisioning and recovery

`PUSH_TOKEN_ENCRYPTION_KEY` encrypts stored push tokens. Replacing it makes existing ciphertext unreadable. It is a Cloudflare-only Worker secret and this workflow never reads, writes, deletes, fingerprints, or versions it.

Before enabling `FCM_SERVICE_ACCOUNT_JSON`, an owner must provision the push key directly on the exact `dayli-api-staging` Worker. Generate a new key only for a new Worker with:

```bash
openssl rand -base64 32
```

Store the single output as `PUSH_TOKEN_ENCRYPTION_KEY` in Cloudflare. It encodes exactly 32 random bytes. Do not print it in tickets, paste it into GitHub, or use this command against an existing Worker. The workflow checks only that the Worker has a secret with this binding name before it accepts FCM synchronization. It cannot inspect or validate the secret value.

For an existing Worker, keep its current key. A rotation needs a reviewed migration or backfill that can decrypt old token ciphertext and re-encrypt it under the new key, plus an approved rollback plan. Perform that Cloudflare-only operation separately from this workflow, verify the backfill, and retain the old value until recovery is complete. For a code rollback, keep the Worker key and bindings compatible with the prior code. Do not delete the Durable Object migration or shared object namespace.
