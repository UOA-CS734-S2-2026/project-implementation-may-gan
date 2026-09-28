# Implementation reference

Use this while building. The other guides explain the design; this document records mechanisms, failure cases, and checks that should not disappear during implementation. It mixes implemented local slices with future work. Treat a statement as current only where it names checked-in code or local coverage. No staging or production deployment has been verified.

## 1. Decisions and service boundaries

- Hono on Workers gives mobile and web one independently deployed backend with direct Cloudflare bindings. Next.js routes would require less migration and can also scale. An always-on Node service is the fallback for incompatible dependencies or heavy processing, not a prerequisite for thousands of users.
- REST/OpenAPI supports generated Dart and TypeScript clients. tRPC's TypeScript inference does not transfer to Flutter. GraphQL is unnecessary for the initial bounded operations.
- REST owns commands/history; hibernating WebSockets carry small change notifications and clients fetch authorized state through REST. Push reaches suspended mobile apps through FCM/APNs. PostgreSQL remains authoritative. No periodic client polling is planned. See the [messaging handoff](messaging-implementation-handoff.md) for the agreed scope and implementation sequence.
- Domain services must not depend on `NextRequest`, Hono contexts, or `TRPCError`. Inject database, clock, and external-service interfaces. Map errors in adapters.
- Better Auth in Hono is the sole identity authority. Temporary Next.js tRPC proxies call Hono with the user's verified credentials, not an unrestricted service account.

## 2. Runtime and deployment gates

Better Auth has Worker and local PostgreSQL coverage. The web and Flutter auth screens are checked in. Local HTTPS development is available through `pnpm local:auth:setup`, `pnpm dev:api:https`, and `pnpm dev:web:https`. The Flutter Google button reports unavailable when no client configuration is supplied. Staging has a deployed API Worker and restricted Hyperdrive with a passing private proof at `1fb6388`. The web Worker is deployed on its Active HTTPS custom domain, and a manual browser email/password flow and sign-out redirect worked. Google, Resend, and native auth remain untested. Production is not deployed. Before porting every remaining endpoint, prove these in the actual Worker runtime:

| Integration | Required checks |
| --- | --- |
| Better Auth | Password hashing dependencies, session creation/expiry, Google/native handoff, reset email, logout/revocation. |
| Drizzle/PostgreSQL | Supported driver, Node compatibility settings, Hyperdrive connections, transactions, rollback, constraint errors. |
| Push | FCM HTTP v1 token minting, credential handling, token refresh, APNs configuration, delivery on both platforms. Do not assume the Node Admin SDK works unchanged. |
| Media | Real type/size validation and bounded decoding within CPU/memory limits. Route heavy work to a suitable processor. |
| Web | Exact Next.js version and deployment-adapter compatibility, SSR authentication, private-cache behaviour. |

Pin working dependencies and OpenAPI generators. Follow driver-specific connection lifecycle guidance; request-scoped connection objects must not leak across Worker invocations. Supply Better Auth with the fresh-read database client.

Wrangler deploys code/bindings, not PostgreSQL migrations. Apply additive Drizzle migrations through the controlled Neon workflow in [Database migrations](../dayli/database-migrations.md) before dependent releases. Declare Durable Object migrations separately. Keep secrets and `.dev.vars` untracked, and separate staging/production resources. Test old mobile clients and document rollback before removing fields/routes.

## 3. PostgreSQL constraints and indexes

Choose indexes against measured query plans, starting with:

| Table/access pattern | Candidate constraint or index |
| --- | --- |
| Daily post | Unique `(author_id, local_date)`; use `DATE` and `TIMESTAMPTZ` for day/release respectively. |
| Friend lookup | Both participant lookup directions; prevent duplicate friendship pairs. |
| Public share link | Unique token hash with post lookup, revocation state, and creation timestamp. |
| Message history | Unique `(conversation_id, sequence)` for ordered pagination. |
| Message retries | Unique `(sender_id, client_message_id)` with stored request fingerprint. |
| Due jobs | Index over pending state and `due_at`, plus lease-expiry lookup for abandoned work. |
| Share/socket ticket | Unique token hash with expiry and atomic claim/consumption state. |

For message ordering, allocate the conversation sequence while holding its row lock in the same transaction as the insert. This also serialises the existing pending-request one-message limit. A generated ID or timestamp alone is not proof of commit order.

Return the original result for an identical idempotent retry. Reusing its key with a different payload should conflict. Keep daily uniqueness even when callers choose different retry keys.

Keep transactions short. Never call R2, FCM, or Durable Objects while holding database locks. Check posting eligibility with server time at the authoritative write, not only when a request first arrives. Treat the transaction's accepted write as the deadline decision; network response time is not eligibility.

Hyperdrive pools connections, not database CPU. Caching must be explicitly disabled for this application because writes do not invalidate cached reads. Workers create postgres.js/Drizzle clients per invocation and close them in `finally` after the completed operation, so clients do not leak across isolates. Do not depend on session state across transactions. The staging proof records transaction behavior and sanitized constraint categories using a least-privilege `app` role.

## 4. Socket authentication and hibernation

Issue a short-lived, single-use connection ticket through authenticated REST. Bind it to user/session, atomically consume it at upgrade, validate browser origins, and derive the object ID from verified identity. Never trust a client-supplied user ID. Redact tickets from URL/access logs; never use a reusable session token in a socket URL.

Only internal bindings publish application events. Rate-limit ticket issuance, socket count, frames, and reconnect attempts. Suggested connection metadata includes session ID and expiry, stored through WebSocket attachments. Attachments survive hibernation, not a disconnected socket.

Use the Hibernation API. Ordinary fields and timers cannot be trusted after eviction. Schedule the next connection expiry through a persisted alarm when needed, close expired sockets, then schedule the next deadline. Revocation must signal affected objects; expiry is the backstop if signalling fails. Recheck validity on relevant events and test idle expiry without incoming traffic.

Test heartbeat behaviour separately in browsers and Flutter. Prefer supported automatic responses that preserve hibernation. Do not let frequent typing/presence or repeating timers keep idle objects running.

On reconnect, subscribe and catch up without a gap: establish the connection, buffer events, fetch history and durable change references, then merge by stable IDs and versions. Refresh conversation/read state too; a new-message cursor alone cannot reconcile edits, reactions, or unsending. If realtime fails, reconnect with bounded backoff and jitter, show a disconnected state, and offer manual refresh. Do not introduce periodic client polling, including a fallback loop. Stop sockets on background/logout and use push for suspended mobile apps.

## 5. Outbox and scheduled jobs

A mutation transaction saves content and per-audience outbox records together. Realtime invalidations reach all affected participants, including the actor's other sessions; private-only read changes reach that user's sessions only. Push targets eligible peer devices, never the actor's devices. Attempt bounded publication immediately after commit so healthy foreground delivery does not wait for a scheduled tick. `waitUntil` can extend an immediate attempt, but is not durable storage or guaranteed retry. Delayed dispatch must acquire and dispose its own invocation-scoped database client. Scheduled processing repairs failed or interrupted attempts; it is not the normal live-delivery path.

The scheduled handler claims a batch with `FOR UPDATE SKIP LOCKED`, records leases, and commits before external calls. On completion, update only if the worker still owns the lease. Reclaim expired leases, cap attempts, and move persistent failures to a reviewable failed state. Use exponential backoff with jitter.

A crash after publishing but before acknowledgement creates a duplicate. Deduplicate realtime events by event ID and messages by message ID. FCM/APNs collapse identifiers can reduce redundant notifications, but do not guarantee exactly-once visible delivery.

If Queues is introduced later, retain the outbox to bridge database commit and queue publication. Consumers remain idempotent. Monitor oldest pending age and processing throughput; a queue cannot compensate for consumers that never catch up.

## 6. Media, caching, and privacy edges

Reserve opaque object paths and quotas before issuing signed uploads. Completion must verify ownership, byte count, actual format, and safe processing limits. Keep media pending until checks pass; a signed PUT is not content validation. Clean unclaimed reservations after a grace period without racing attachment transactions.

Client compression reduces upload cost. Strip unnecessary EXIF and keep private downloads behind current permissions and release checks. URLs are short-lived bearer credentials; existing URLs may work until expiry after revocation, and downloaded copies cannot be recalled.

Start private API responses with `Cache-Control: no-store`. Any owner recap cache must invalidate after edits/deletes. Never use a shared Next.js/CDN cache for unscoped user content. Provider encryption at rest does not replace access controls, private backups, or restoration tests.

Protect local drafts and credentials beyond a biometric UI prompt. Test access after enrolment changes, passcode fallback, lockout, reinstall, and key invalidation. Keep private content out of logs, push previews, and assistant/deep-link analytics. External AI processing requires a separate privacy decision.

## 7. Evidence before release

Turn each mechanism into an issue acceptance test. Include concurrent writes, expired tickets after hibernation, provider outages, lost/duplicate events, stale caches, malformed media, and fresh-device recovery. Record runtime versions, test data, network, and provider plan. Use synthetic data and authorised staging only.

See [Security](../dayli/security.md), [Testing](../dayli/testing-and-delivery.md), and [Scalability](../dayli/scalability.md) for the concise release rules and workload targets.

## 8. Readiness checklist

The compatibility slice is no longer just a proposal. The monorepo, Hono Worker, Flutter shell, OpenAPI document and generated clients, Drizzle migrations, local PostgreSQL checks, auth screens, posting-day route, daily-post route, relationship routes, and media-reservation routes are checked in. The web composer calls the daily-post route. The Flutter composer does not yet have a real `DailyPostSubmitter`, and neither client completes a reserved-media upload.

These items remain open:

- Provision isolated Cloudflare resources and PostgreSQL, confirm quotas/budget, choose web/API domains, and configure email, OAuth, FCM/APNs, and iOS signing. Use placeholders until owners supply secrets through approved stores. Staging has user-verified restricted database roles but no deployed service or applied application migrations. Production is undeployed.
- Run the local auth walkthrough, then prove the Worker integrations against provisioned staging. This includes native and web login, a Hyperdrive transaction as `app`, real R2 signing and upload rejection, and a WebSocket update with reconnect. Select the Next.js deployment adapter only after its compatibility check.
- Wire the Flutter daily-post client and media reservation/upload flow. Link completed media to posts only after byte-size and actual-format validation.
- Implement the agreed rules in [Product decisions](../dayli/product-decisions.md): friends see earlier released friends posts, released edits retain visible revision history, and blocks stop interaction while preserving message history.
- Enforce three mixed attachments, 10 MB per attachment, 25 MB per post, and 15-second videos. Test iOS 16+ and Android 10/API 29+ plus documented fallbacks.
- Apply immediate application deletion, 30-day backup expiry, and the initial 24-hour RPO and 8-hour RTO. Verify the recovery targets through a recorded restoration exercise.
- Assign the first issues and reviewers in the course board. Keep frontend reuse approval, test evidence, and service-account ownership in team records. Do not create a separate project-management system.

Continue in vertical slices, not a complete backend rewrite or all native additions at once. Resolve product-policy questions before their dependent features, rather than blocking unrelated setup.

## Primary references

- [Hono on Workers](https://hono.dev/docs/getting-started/cloudflare-workers)
- [Hyperdrive PostgreSQL](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/) and [query caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/)
- [Hibernating WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) and [Durable Object alarms](https://developers.cloudflare.com/durable-objects/api/alarms/)
- [PostgreSQL locking/select behaviour](https://www.postgresql.org/docs/current/sql-select.html)
- [Better Auth bearer sessions](https://better-auth.com/docs/plugins/bearer)
- [FCM HTTP v1](https://firebase.google.com/docs/cloud-messaging/send/v1-api)
