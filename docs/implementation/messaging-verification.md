# Messaging local verification and release gates

## Stack and implementation state

Merge order is refactor PR #134, friends PR #137, then the messaging PR based on `feature/friends-ui`. Messaging includes the approved REST/storage/delivery implementation, both client action flows, action-scoped TanStack Query on web, and Flutter session/startup/quarantine fixes. Changes are split into focused commits; generated client changes accompany API changes.

Migration order is `0009_relationship_search`, `0010_messaging_foundation`, then `0011_encrypt_push_device_tokens`. These feature migrations have been exercised locally, not deployed by this work. Do not use an earlier parallel branch's `0009_messaging_foundation` journal.

## Final combined local verification

The orchestrator reran these commands against the combined feature branch after the final query-race correction and moved-import fix:

```bash
pnpm verify:local
pnpm --filter @dayli/api test:realtime
```

Both passed. The run included installation from the pinned lockfile, lint, typecheck, web build, OpenAPI/client generation equality, generated Dart checks, Flutter formatting/analysis/tests, isolated PostgreSQL migrations, and SQL integration tests.

| Suite | Result |
| --- | --- |
| API ordinary tests | 32 files, 180 passed |
| API PostgreSQL integration | 10 files, 52 passed |
| Web rendered/query tests | 5 files, 23 passed |
| Flutter tests | 67 passed |
| Worker realtime runtime | 1 test passed |
| DB migration integration | 9 passed |
| DB transaction integration | 1 passed |
| DB relationship integration | 3 passed |

The ordinary DB unit command reports 13 database-gated skips; the dedicated later PostgreSQL phase ran its migration/transaction/relationship suites against the isolated fixture. A skipped test is not itself evidence of a pass. The debug APK path uses `pnpm verify:local:full` and was not claimed by this final default run.

Independent read-only reviews approved the reviewed fixes for REST authorization/pagination/idempotency, realtime dispatch authorization and lease ownership, revoked push-device sessions, web user-facing actions and query races, and Flutter durable recovery, credential quarantine and session startup isolation. The final combined run catches integration/build regressions; it is not a substitute for deployed cross-device testing.

## Important verified failure cases

- Block policy applies at writes and delayed dispatch; author unsend remains allowed for pending/declined requests only when not blocked.
- Retry identity is retained, including optimistic sends before history loads. Old snapshots cannot erase pending/canonical sends.
- Pagination retains timestamp precision and old-history position. Durable change cursors advance only after referenced projections are obtained/applied; tombstones clear reply previews.
- Lease loss aborts abortable provider work, acknowledgements are fenced, and non-abortable publication rechecks ownership immediately before starting. Already-started external effects remain at-least-once, not exactly-once.
- Realtime events reach authorized actor/peer sessions; push targets eligible peers. Revoked, banned, deleted, blocked or invalidated destinations are suppressed.
- Account replacement acknowledges revocation of the prior server session before installing new credentials. Pending-revocation credentials are protected and quarantined from ordinary API/session restore use. Late old-session callbacks cannot revive sockets or push startup.
- Both friends and messaging client tests remain in the combined tree. Web query keys are user-scoped and private caches clear on session changes; no periodic polling is introduced.

## Unverified external release gates

- Provision and verify staging Worker bindings, Durable Object migration, retry cron, exact trusted origins, and Hyperdrive configuration. No deployment was performed here.
- Supply approved push encryption and FCM credentials through secret storage. Push stays safely disabled when required configuration is absent. Follow the encrypted-token migration policy for any existing plaintext registrations; do not copy secrets into docs, logs or issue bodies.
- Configure Firebase/APNs and test on physical iOS/Android devices, including denied permission, background/terminated delivery, token rotation and notification taps. Mock-provider success is not device delivery proof.
- Run the deployed phone-to-browser conversation and recovery demo. Rendered web tests use jsdom, not an actual browser deployment. Flutter unit/widget tests do not constitute a real API emulator/device journey.
- Record a measured staging send-to-visible latency and workload test. No production capacity or cost claim follows from the unit/integration counts above.
- CI remains manual-only pending repository-owner budget/publication approval. No visibility change, hosted workflow execution, or merge was performed.

Images/video remain blocked on the R2 owner's integration. Group chats remain deferred pending policy. Browser push, typing/presence and E2EE remain outside this release. Read the messaging handoff for those boundaries and the current architecture for API/security rationale.
