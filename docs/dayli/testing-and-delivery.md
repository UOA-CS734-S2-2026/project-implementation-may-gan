# Testing and delivery

## Test plan

| Level | Tool and coverage |
| --- | --- |
| Units | Vitest/Dart: dates, permissions, retries, recaps. |
| Database | Isolated PostgreSQL: transactions, constraints, races, share-token revocation, outbox. |
| Runtime | Workers Vitest/Wrangler: Hono, bindings, schedules, hibernation, alarms. |
| Contracts | Generate/compile Dart and TypeScript clients; test old-client compatibility. |
| Web/mobile | Playwright, Flutter widgets, physical iOS/Android workflows. |
| Security/load | Negative access tests, fault injection, k6 and device timings. |

Emulators do not prove hardware key protection or every sensor feature. Android screenshot detection excludes ADB captures. Test deployed bindings in isolated staging too.

## Local verification while hosted checks are paused

GitHub-hosted PR and push checks are temporarily paused to preserve shared Actions minutes. `.github/workflows/ci.yml` and `.github/workflows/database-migrations.yml` accept manual dispatch only, so there are no automated hosted gates for a PR or push. A manual GitHub run still consumes GitHub-hosted minutes. The intended verification path is local:

```bash
pnpm verify:local
```

The command requires Node.js 24, pnpm 10, JDK 17, Docker with Compose, Flutter, and Dart. It installs locked workspace dependencies; runs lint, type checking, tests, builds, generated TypeScript and Dart client checks, Flutter formatting, analysis and tests; then starts a fresh PostgreSQL 18 fixture for migration checks, migration application, verification, idempotency, restricted-role integration tests, and credential-error safety checks. The fixture has a unique Compose project and is removed with its volumes on success, failure, or interruption. Port 5433 must be available.

`pnpm verify:local:full` adds the debug Android APK build. Record `git rev-parse HEAD`, the command mode, and sanitized output in the PR or approved evidence location. Do not commit evidence that could include credentials. This local fixture check does not contact Neon or Cloudflare and is not a staging proof.

The protected `run-database-migrations.yml` and `staging-hyperdrive.yml` workflows remain manual. `cleanup-hyperdrive-preview.yml` is manual only, runs from `main` with a required PR number, and verifies a closed, main-based, same-repository non-fork PR before cleaning only its preview Worker. It does not test or deploy new PR code. The staging environment now holds Cloudflare credentials for the manual API proof, but that does not authorize preview cleanup. Use cleanup only after a separate decision for an eligible closed PR worker.

## Credentialed staging checks

The staging owner reports verified restricted roles, migrations `0000` through `0007`, a cache-disabled `app` Hyperdrive, and a deployed API Worker. The private `select 1 as ok` check passed after the test harness update, but the transaction test timed out at five seconds. Staging remains unvalidated, and no production service is deployed. The manual check must still prove Drizzle commit, explicit rollback, constraints, recovery, authorization, cleanup, and fresh-invocation visibility through a non-HTTP Worker service entrypoint. `staging-hyperdrive.yml` runs only on manual dispatch, never before merge or after a push to `main`. Local verification remains the active proof. Setup, access expectations, required environment values, and the future command are in [`apps/api/README.md`](../../apps/api/README.md). [Environments](environments.md) covers local HTTPS auth plus staging and production boundaries.

Use the [implementation reference](implementation-reference.md) to turn mechanisms and remaining setup decisions into testable issues.

## Release gates

- Concurrent posts/messages and retries never duplicate accepted content or bypass daily/request limits.
- Auckland midnight, daylight-saving, leap-day, and incorrect-clock tests pass.
- Alternate routes, caches, media, and sockets never bypass permissions.
- Outbox retries and reconnect catch-up survive lost/duplicate events.
- Ticket replay, expiry, logout, and revocation remain safe after hibernation.
- Failed uploads preserve drafts; cleanup never deletes attached media.
- Provider outages use bounded retries and honest pending/failed states.
- Recovery meets the tested 24-hour RPO and 8-hour RTO; revoked public links cannot be reused.
- No private content or credentials leak through logs, telemetry, URLs, or push.

Performance workloads and targets live in [Scalability](scalability.md).

## Migration and release

1. Record the August 2026 frontend reuse approval and source attribution. Import useful WDCC frontend code without secrets or build output.
2. Establish the monorepo and prove auth/database/native compatibility on Workers.
3. Move reusable services and auth authority into Hono. Temporary tRPC proxies may call Hono, but must not become a competing backend.
4. Add release/audience fields, private uploads, public share tokens, idempotency, socket tickets, and jobs. Replace process-local SSE with Durable Objects.
5. Complete [MVP phases](mvp.md), remove obsolete routes, run failure/load tests, and rehearse restore/deploy.

While hosted checks are paused, `pnpm verify:local` is the required developer verification evidence rather than an automated gate. It checks formatting, types, contracts, relevant backend/runtime and frontend tests. Its PostgreSQL fixture also checks Drizzle metadata, schema drift, Squawk safety, local PostgreSQL 18 application, rollback, locking, and restricted-role behavior. Shared changes test all affected apps. Deploy API and web independently; run PostgreSQL migrations separately through the [database migration runbook](database-migrations.md) and declare Durable Object migrations. Keep secrets/signing credentials away from untrusted PRs.

Prefer additive changes for older mobile clients. Deleted data becomes inaccessible immediately and expires from encrypted backups within 30 days. Start with a 24-hour RPO and 8-hour RTO, then verify both through restoration tests. The checked-in local suite covers Worker routes, PostgreSQL integration, generated clients, and Flutter tests. It is not a deployed staging or physical-device result.

## Team evidence

Split initial leads across mobile, backend/cloud, web/reflection, and messaging/security. Everyone tests, reviews, and explains their AI-assisted changes. Use the course board, reviewed PRs, weekly minutes, user research, native demonstrations, and security/load results as evidence. Track phases against the 4 October 2026 deadline; no weekly capacity estimate has been agreed.
