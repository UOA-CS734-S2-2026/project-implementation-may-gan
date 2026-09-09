# Implementation reference

Use this while building. The other guides explain the design; this document records mechanisms, failure cases, and checks that should not disappear during implementation. All items are proposed work, not verified behaviour.

## 1. Decisions and service boundaries

- Hono on Workers gives mobile and web one independently deployed backend with direct Cloudflare bindings. Next.js routes would require less migration and can also scale. An always-on Node service is the fallback for incompatible dependencies or heavy processing, not a prerequisite for thousands of users.
- REST/OpenAPI supports generated Dart and TypeScript clients. tRPC's TypeScript inference does not transfer to Flutter. GraphQL is unnecessary for the initial bounded operations.
- REST owns commands/history; WebSockets carry change notifications; push reaches suspended apps. PostgreSQL remains authoritative.
- Domain services must not depend on `NextRequest`, Hono contexts, or `TRPCError`. Inject database, clock, and external-service interfaces. Map errors in adapters.
- Better Auth in Hono is the sole identity authority. Temporary Next.js tRPC proxies call Hono with the user's verified credentials, not an unrestricted service account.

## 2. Runtime and deployment gates

Before porting every endpoint, prove these in the actual Worker runtime:

| Integration | Required checks |
| --- | --- |
| Better Auth | Password hashing dependencies, session creation/expiry, Google/native handoff, reset email, logout/revocation. |
| Drizzle/PostgreSQL | Supported driver, Node compatibility settings, Hyperdrive connections, transactions, rollback, constraint errors. |
| Push | FCM HTTP v1 token minting, credential handling, token refresh, APNs configuration, delivery on both platforms. Do not assume the Node Admin SDK works unchanged. |
| Media | Real type/size validation and bounded decoding within CPU/memory limits. Route heavy work to a suitable processor. |
| Web | Exact Next.js version and deployment-adapter compatibility, SSR authentication, private-cache behaviour. |

Pin working dependencies and OpenAPI generators. Follow driver-specific connection lifecycle guidance; request-scoped connection objects must not leak across Worker invocations. Supply Better Auth with the fresh-read database client.

Wrangler deploys code/bindings, not PostgreSQL migrations. Apply additive Drizzle migrations through a controlled connection before dependent releases. Declare Durable Object migrations separately. Keep secrets and `.dev.vars` untracked, and separate staging/production resources. Test old mobile clients and document rollback before removing fields/routes.

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

Hyperdrive pools connections, not database CPU. Start with caching explicitly disabled: it defaults on, and writes do not invalidate cached reads. Keep sessions, permissions, blocks, and immediate history reads fresh. Any later cache-enabled client needs a separate, deliberate use case.

## 4. Socket authentication and hibernation

Issue a short-lived, single-use connection ticket through authenticated REST. Bind it to user/session, atomically consume it at upgrade, validate browser origins, and derive the object ID from verified identity. Never trust a client-supplied user ID. Redact tickets from URL/access logs; never use a reusable session token in a socket URL.

Only internal bindings publish application events. Rate-limit ticket issuance, socket count, frames, and reconnect attempts. Suggested connection metadata includes session ID and expiry, stored through WebSocket attachments. Attachments survive hibernation, not a disconnected socket.

Use the Hibernation API. Ordinary fields and timers cannot be trusted after eviction. Schedule the next connection expiry through a persisted alarm when needed, close expired sockets, then schedule the next deadline. Revocation must signal affected objects; expiry is the backstop if signalling fails. Recheck validity on relevant events and test idle expiry without incoming traffic.

Test heartbeat behaviour separately in browsers and Flutter. Prefer supported automatic responses that preserve hibernation. Do not let frequent typing/presence or repeating timers keep idle objects running.

On reconnect, subscribe and catch up without a gap: establish the connection, buffer events, fetch history, then merge by stable IDs. Refresh conversation/read state too; a new-message cursor alone cannot reconcile edits or deletions. If realtime fails, poll only visible conversations with bounded backoff. Stop on background/logout and use push for suspended apps.

## 5. Outbox and scheduled jobs

A mutation transaction saves content and per-recipient outbox records together. Attempt bounded publication after commit. `waitUntil` can extend an immediate attempt, but is not durable storage or guaranteed retry.

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

See [Security](security.md), [Testing](testing-and-delivery.md), and [Scalability](scalability.md) for the concise release rules and workload targets.

## 8. Readiness checklist

The architecture is sufficient to start a compatibility experiment. These items are still open, not completed implementation:

- Scaffold the monorepo, import attributed WDCC code, pin versions, and establish local/test CI. No Hono or Flutter app has been created by this proposal.
- Provision isolated Cloudflare resources and PostgreSQL, confirm quotas/budget, choose web/API domains, and configure email, OAuth, FCM/APNs, and iOS signing. Use placeholders until owners supply secrets through approved stores.
- Pass one vertical slice: native/web login, a Hono database transaction, private media access, and a WebSocket update with reconnect. Select the Next.js deployment adapter only after its compatibility check.
- Write the first OpenAPI schemas, error contracts, database migration, and shared fixtures. Generated clients and record shapes are not yet specified by the overview tables.
- Implement the agreed rules in [Product decisions](product-decisions.md): friends see earlier released friends posts, released edits retain visible revision history, and blocks stop interaction while preserving message history.
- Enforce three mixed attachments, 10 MB per attachment, 25 MB per post, and 15-second videos. Test iOS 16+ and Android 10/API 29+ plus documented fallbacks.
- Apply immediate application deletion, 30-day backup expiry, and the initial 24-hour RPO and 8-hour RTO. Verify the recovery targets through a recorded restoration exercise.
- Assign the first issues and reviewers in the course board. Keep frontend reuse approval, test evidence, and service-account ownership in team records. Do not create a separate project-management system.

Begin with the compatibility slice, not a complete backend rewrite or all native additions at once. Resolve product-policy questions before their dependent features, rather than blocking unrelated setup.

## Primary references

- [Hono on Workers](https://hono.dev/docs/getting-started/cloudflare-workers)
- [Hyperdrive PostgreSQL](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/) and [query caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/)
- [Hibernating WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) and [Durable Object alarms](https://developers.cloudflare.com/durable-objects/api/alarms/)
- [PostgreSQL locking/select behaviour](https://www.postgresql.org/docs/current/sql-select.html)
- [Better Auth bearer sessions](https://better-auth.com/docs/plugins/bearer)
- [FCM HTTP v1](https://firebase.google.com/docs/cloud-messaging/send/v1-api)
