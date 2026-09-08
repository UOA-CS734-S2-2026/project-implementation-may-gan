# Testing and delivery

## Test from the first working flow

Every feature issue needs an acceptance scenario and test evidence. Retain existing service tests, but update assertions where the revised post privacy rules intentionally remove public journal access.

| Level | Tests | Tools/evidence |
| --- | --- | --- |
| Domain units | Auckland dates, visibility, reminder expiry, retry states, recap calculations | Vitest and Dart tests with injected clocks. |
| Database integration | Constraints, duplicate daily submissions, message-request races, grants, rollback, job leases, idempotency | Disposable PostgreSQL and Drizzle migrations. |
| API contracts | OpenAPI generation, Dart/TS DTOs, JSON semantics, errors, compatibility with older mobile clients | Generate, compile, and fail CI on contract drift. |
| Web end-to-end | Login, posting, gated feed, history, sharing, messaging, password recovery | Playwright with isolated users. |
| Flutter UI | Composer states, denied permissions, local lock, retry UX | Widget tests with repository/native-service fakes. |
| Native integration | Camera, mic, local data protection, biometrics, resume, deep links, assistant actions, push, screenshots | `integration_test` plus physical iOS/Android evidence. |
| Messaging integration | Committed message notification, failed publication, duplicate events, reconnect catch-up, scoped tokens | API/Ably test environment and controlled fault injection. |
| Security | Cross-user access attempts, private URLs, expired sessions, invitation races, cache/log leakage | Automated negative tests and documented manual review. |
| Performance | Midnight traffic, upload completion, date-range aggregates, chat bursts, cold starts | k6 plus physical-device/browser timings. |

No cross-language E2EE vectors or encryption-key recovery tests are required under the revised design. Test local encryption at rest, TLS, provider configuration, session recovery, and permissions instead.

Emulators do not prove every native behaviour. Android screenshot detection excludes ADB captures; test its supported physical action. Simulator biometric success does not establish hardware-backed storage protection.

## Release-blocking scenarios

1. Two requests submit one user's day simultaneously. Exactly one post exists. Retrying an accepted idempotency key returns the original result.
2. Submit before, exactly at, and after Auckland midnight with incorrect device clocks. Test both daylight-saving transitions and leap days.
3. Try another user's post, media, grant, conversation, note, recap, and export IDs. No alternate route or shared cache leaks content.
4. Remove a friend, block a user, or revoke a share during access. Future API access stops; document remaining signed-URL lifetime and downloaded-copy limits.
5. Send multiple pending conversation messages concurrently. The one-message-before-acceptance limit cannot be bypassed.
6. Crash after persisting a message but before realtime publish. The outbox retries, and reconnect retrieves history. Duplicate events never duplicate stored or displayed messages.
7. Crash after push dispatch but before job completion. Retry is bounded and uses available collapse/dedupe mechanisms. Do not promise exactly-once OS notifications.
8. Complete an upload but fail final submission. The draft survives, retries are safe, and orphan cleanup removes unused media.
9. Fail PostgreSQL, Ably, Upstash, weather, R2, or FCM. Preserve drafts, use bounded retry/fallback, and distinguish accepted, failed, pending, and read states.
10. Reset a password and sign in on a fresh phone/browser. Server-held history returns; unsynced drafts on a lost device do not. Revoked sessions cannot fetch content.
11. Race two claims against a single-use share token. Only one succeeds. Expired/revoked links and unrelated recap/history access are denied.
12. Inspect logs, telemetry, browser caches, mobile files, signed URLs, and push payloads using seeded canary content. Content in its authorised database is expected; content in an unrelated log or another user's response is not.

## Performance targets

These are proposed targets, not current measurements.

- 100 daily active users and 50 simultaneous midnight viewers.
- Warm metadata API p95 below 500 ms, with fewer than 1% unexpected errors under the defined workload. Record cold starts separately.
- A 20-entry feed becomes useful on a mid-range phone within two seconds after metadata arrives on the recorded network. Load thumbnails before full images.
- Measure owner-scoped yearly aggregate queries and browser chart rendering separately. Bound date ranges and avoid sending every full post/media object just to draw a graph.
- Measure message persistence-to-visible-update latency under normal delivery and the delayed outbox-retry path. Aim for p95 under two seconds while realtime is healthy; report failed-provider recovery separately.
- Dispatch ordinary due reminders within two minutes at baseline. Measure OS push arrival separately from backend dispatch.

Run a ramp, midnight burst, cold start, and sustained test. Record hosting plan, region, test network, hardware, dataset, request mix, payload sizes, and realtime fan-out. Use only owned/authorised staging systems and respect third-party load-test limits.

Repeat at 500 daily users and 200 simultaneous viewers. Inspect SQL plans, database pool saturation, realtime quotas, worker lag, and storage growth before adding instances. Include message-event-triggered REST reads in the workload.

## Four-person ownership

Assign actual owners in GitHub after team agreement.

| Lead area | First responsibility | Review partner |
| --- | --- | --- |
| Mobile | Composer, drafts, camera, native integrations, biometric UX | Web lead checks shared user journeys. |
| Backend/cloud | REST contracts, PostgreSQL, uploads, jobs, hosting | Messaging/security lead reviews authorisation and failure modes. |
| Web/reflection | Port queries, archive, mood history, recap, sharing | Mobile lead checks cross-client behaviour. |
| Messaging/security | Existing DM services, Ably integration, sessions/recovery, security tests | Backend lead reviews transactions and deployment boundaries. |

Everyone writes tests and reviews work outside their primary area. AI-generated code needs an owner who can explain its request flow, assumptions, and failure cases. Rotate demo and review responsibilities for individual interview readiness.

## Migration sequence

1. Record lecturer approval, reuse permission, and baseline attribution in the course repository.
2. Import useful Next.js code without secrets/build output. Port CI and isolated local/test data. Do not carry over automatic production deployment credentials or targets.
3. Prove native authentication, private media, realtime catch-up, push, and local storage protection.
4. Extract transport-independent services and add REST/OpenAPI adapters. Temporarily retain tRPC against the same service layer.
5. Add audience/release fields, media reservations, explicit grants, jobs/outbox, and message idempotency. Keep existing content columns and mood SQL. Use a new development database rather than automatically resetting a hosted one.
6. Deliver the daily loop and cross-client messaging. Validate deadline and permission rules through direct API tests.
7. Build the remaining context, memory, assistant, and reflection phases. Remove obsolete tRPC calls and process-local SSE once both clients use the new interfaces.
8. Run security/load tests, rehearse deployment and backup restoration, freeze a demo build, and document limitations.

The earlier Matrix/E2EE migration is cancelled. Do not add its schemas, crypto dependencies, recovery codes, or infrastructure.

No hours-per-week commitment was established during discovery. Use dependency phases instead of inventing a delivery guarantee. Track progress against the course implementation deadline of 4 October 2026 and raise feasibility problems early.

## CI and deployment

Pull requests run formatting, lint, types, generated-contract checks, backend tests, Flutter analysis/tests, and relevant browser tests. Add emulator smoke tests within runner limits. Use an approved Mac workflow or documented device process for iOS; do not expose signing keys to untrusted pull requests.

Separate local, test, and deployed environments. Secret values belong in platform secret stores, not tracked config or generated clients. Check dependency/licence changes and enforce branch review.

Use additive schema changes while older web/mobile clients remain active. A code rollback does not undo a destructive migration. Back up database and private media, restrict backup access, verify backup encryption, document retention, and test restoration. Provider disk encryption is not a backup strategy. Free plans may lack automatic backups or an SLA.

Monitor API failures, denied access, auth abuse, realtime quota use, message publication lag, reminder lag, storage growth, and pool saturation. Keep payload bodies, passwords, reset tokens, and signed URL credentials out of telemetry.

## Course evidence

| Requirement | Evidence |
| --- | --- |
| Target users | Student interviews and daily-capture/reflection stories. |
| Flutter on both platforms | iOS/Android builds and physical-device demonstrations. |
| Mobile capabilities | Camera, coarse-location context, mic, biometrics, push, and supported native shortcuts. |
| Distinct web app | Calendar, long-term mood analysis, year-in-review, with posting fallback. |
| Shared cloud backend | REST/OpenAPI, common PostgreSQL, private storage, and authenticated realtime updates. |
| Protocol selection | REST versus tRPC/GraphQL decision; durable REST history versus ephemeral realtime/push. |
| Scaling | Midnight tests, storage forecast, bottleneck measurements, upgrade triggers. |
| Testing | Unit, integration, contract, browser, physical-device, failure, and load evidence. |
| Cybersecurity | OWASP review, permissions, session recovery, storage/TLS checks, explicit server-readable privacy model. |
| Beyond lectures | Native integrations, durable outbox delivery, cross-language contracts, cloud trade-offs. |
| Team practice | Course board, issues, reviewed PRs, weekly minutes, individual contributions. |
| Reuse restriction | Written lecturer approval and attribution of imported 732 code. |

Use the provided course GitHub project board for assessed tracking. The WDCC documentation copy is a reference, not a replacement for course-repository evidence.
