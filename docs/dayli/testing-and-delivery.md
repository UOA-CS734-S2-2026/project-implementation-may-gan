# Testing and delivery

## Test ownership

Every feature issue needs acceptance criteria and evidence. Keep useful WDCC tests and update assertions where the new privacy rules remove public access. No runtime tests have been executed as part of this documentation change.

| Level | Coverage |
| --- | --- |
| Units | Calendar rules, visibility, retry state, recaps; Vitest and Dart fakes. |
| PostgreSQL integration | Constraints, transactions, message-request races, grants, idempotency, outbox leases. |
| Workers runtime | Hono routes, bindings, scheduled handlers, Durable Object hibernation and alarms; Workers Vitest integration and Wrangler. |
| Contracts | Generate/compile Dart and TypeScript clients, stable JSON/errors, older-client compatibility. |
| Web | Playwright login, posting, history, sharing, chat, and recovery. |
| Mobile | Widget tests plus physical iOS/Android capture, permissions, secure storage, biometrics, deep links, push, and supported assistants. |
| Security/realtime | Socket auth/expiry/revocation, lost events, reconnect catch-up, duplicate events, cross-user access, cache/log leakage. |
| Load | k6 and device timings using the workloads in [Scalability](scalability.md). |

Emulators do not prove every native feature. Android's screenshot API excludes ADB screenshots, and simulated biometric prompts do not prove hardware-backed storage behaviour. Test hibernation and deployed bindings in an isolated Cloudflare environment as well as locally.

## Release-blocking scenarios

1. Concurrent daily submissions create one post; retries return the original accepted result. Test midnight, daylight-saving transitions, leap days, and incorrect device clocks.
2. No list/detail/media/export route exposes another user's content, unreleased posts, or private recap. Block/revocation stops future access within the documented URL/session limits.
3. Concurrent pending-conversation sends cannot bypass the one-message limit. Message retries and duplicate events do not create duplicate bubbles.
4. A crash after commit but before publication leaves retriable outbox work. Reconnect fetches missed history even without an event.
5. Socket tickets cannot be reused, swapped between users, or used after expiry. Revocation and expiry still work after hibernation; internal publish operations are unreachable to clients.
6. Failed final submission preserves a draft and permits safe retries. Orphan cleanup removes unused media without deleting attached objects.
7. Fail PostgreSQL, Hyperdrive, realtime delivery, rate-limit bindings, weather, R2, and push. Preserve data, bound retries, and report pending/failed/accepted states honestly.
8. Scheduled work catches up after interruption, discards obsolete nudges, and tolerates duplicate execution. Do not promise exactly-once OS push arrival.
9. Recovery on a fresh phone/browser returns server history, not lost unsynced drafts. Revoked sessions cannot fetch content.
10. Race single-use invitation claims and inspect seeded canary content in logs, URLs, caches, telemetry, and push payloads.

## Migration sequence

1. Record lecturer approval, reuse permission, and imported commit attribution in the course repo.
2. Import useful Next.js UI/services/tests without secrets or build output. Set up pnpm workspaces, Flutter tooling, and isolated data.
3. Prove Better Auth, Drizzle/Hyperdrive, private uploads, FCM, and native clients against a Hono Worker. Test the Next.js hosting adapter separately.
4. Extract domain services, add REST/OpenAPI adapters in `apps/api`, and move auth authority there. Temporarily keep old tRPC routes as compatibility proxies to Hono where needed; do not leave a competing write/auth backend in Next.js.
5. Add audience/release fields, private-media lifecycle, explicit grants, jobs/outbox, socket tickets, and message idempotency. Keep content columns and SQL mood queries.
6. Replace process-local SSE with Durable Objects/WebSockets. Complete the daily loop and cross-client chat, then the remaining [MVP phases](mvp.md).
7. Remove obsolete tRPC/auth/write routes once clients migrate. Run security/load tests, rehearse restore/deploy, and freeze a documented demo build.

## CI and release

PRs run formatting, lint, types, contract generation, backend/runtime tests, Flutter analysis/tests, and relevant browser checks. Changes to shared packages trigger all affected clients' tests. Add emulator checks within runner limits; use approved Mac/device workflows for iOS. Never expose signing secrets to untrusted PRs.

Deploy API with Wrangler and web independently. Use separate local, test, and deployed credentials/bindings. Apply reviewed PostgreSQL migrations as a controlled step; declare Durable Object migrations in Wrangler configuration. Neither schema migration should be hidden inside an HTTP handler.

Use additive changes while older mobile binaries remain active. Document rollback, database/media backup retention, and restoration procedures. Free plans may lack automatic backups or an SLA. Operational targets and upgrade triggers live in [Scalability](scalability.md).

## Team and course evidence

| Lead area | First responsibility |
| --- | --- |
| Mobile | Composer, drafts, native capabilities, local lock. |
| Backend/cloud | Hono, contracts, PostgreSQL, R2, jobs, deployment. |
| Web/reflection | Port API calls, calendar, mood history, recaps, sharing. |
| Messaging/security | Durable Objects, socket lifecycle, sessions/recovery, negative tests. |

Assign actual owners through the course GitHub board. Everyone writes tests and reviews outside their primary area. Authors must explain AI-assisted code and its failure cases. Keep weekly meeting minutes and rotate demo ownership for individual interview readiness.

Use the supplied repository for user research, issues, PRs, minutes, architecture decisions, and test evidence. Demonstrate distinct mobile capture and web reflection, shared API protocols, native features, cloud scaling, OWASP controls, and original contributions beyond imported code. Preserve written reuse approval.

No hours-per-week commitment was established. Track dependency phases against the 4 October 2026 implementation deadline rather than inventing a delivery guarantee.
