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

## Credentialed staging checks

The API Hyperdrive check is deferred until staging is provisioned. At the time of this review, the separate Neon staging project is empty, with no roles, migrations, or Hyperdrive attached. Any pre-existing staging Worker remains connected to its old configuration and must be inventoried and retired before use. It is not a validated endpoint for the new project. Production is unprovisioned. When available, the manual check will retain `select 1 as ok` and prove Drizzle commit, explicit rollback, constraints, recovery, authorization, cleanup, and fresh-invocation visibility through a non-HTTP Worker service entrypoint. `staging-hyperdrive.yml` runs only on manual dispatch, never before merge or after a push to `main`. Local CI remains the active proof. Setup, access expectations, required environment values, and the future command are in [`apps/api/README.md`](../../apps/api/README.md). The [environment guide](environments.md) covers local PostgreSQL, local Hyperdrive simulation, and production boundaries.

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

CI checks formatting, types, contracts, relevant backend/runtime and frontend tests. The separate **Database migrations** workflow checks Drizzle metadata, schema drift, Squawk safety, local PostgreSQL 18 application, rollback, locking, and restricted-role behavior. Shared changes test all affected apps. Deploy API and web independently; run PostgreSQL migrations separately through the [database migration runbook](database-migrations.md) and declare Durable Object migrations. Keep secrets/signing credentials away from untrusted PRs.

Prefer additive changes for older mobile clients. Deleted data becomes inaccessible immediately and expires from encrypted backups within 30 days. Start with a 24-hour RPO and 8-hour RTO, then verify both through restoration tests. No runtime tests were run for the original documentation-only proposal.

## Team evidence

Split initial leads across mobile, backend/cloud, web/reflection, and messaging/security. Everyone tests, reviews, and explains their AI-assisted changes. Use the course board, reviewed PRs, weekly minutes, user research, native demonstrations, and security/load results as evidence. Track phases against the 4 October 2026 deadline; no weekly capacity estimate has been agreed.
