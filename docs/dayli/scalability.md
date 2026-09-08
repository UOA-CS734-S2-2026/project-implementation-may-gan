# Scalability

## Design for Dayli's workload

Thousands of registered accounts do not imply thousands of concurrent requests. Dayli's likely pressure points are midnight feed openings, PostgreSQL queries, retained photos, and realtime delivery across multiple devices.

Start with one Hono API deployment, one PostgreSQL database, private R2 media, per-user Durable Objects, and durable jobs. Scale measured bottlenecks. Do not add microservices, Kubernetes, sharding, or multiple writable database regions in anticipation of unspecified demand.

## Planning and load-test stages

These are proposed workloads, not demonstrated capacity.

| Stage | Daily active users | Simultaneous midnight viewers | Primary photo growth per 30 days |
| --- | --- | --- | --- |
| Course baseline | 100 | 50 | About 3 GB |
| Pilot | 500 | 200 | About 15 GB |
| Growth experiment | 5,000 | 1,000 | About 150 GB |

Storage assumes one 1 MB photo per daily user, every day. It excludes thumbnails, audio, avatars, message bodies, revisions, and backups. At 5,000 daily users, original photos alone add about 1.8 TB per year. An anniversary feature requires a retention budget, not just a launch-month estimate.

For a growth burst, 1,000 viewers making three metadata requests each over ten seconds produces roughly 300 requests per second. Model chat, socket handshakes, event-triggered fetches, and media traffic separately. Record average friend count and history length because they change query cost.

## Midnight traffic

- Check stored `release_at` on reads. Do not update every post or build every feed at midnight.
- Default to a bounded page, initially 20 posts. Return author and interaction summaries without a separate query per post.
- Load thumbnails first. Full-size images load on demand directly from R2.
- Batch push dispatch. Feed access must work even if notifications lag.
- Add jitter and backoff to retries/reconnects. A provider recovery must not make every client retry at once.

A worldwide Worker network does not remove distance to PostgreSQL. An Auckland-centred product should choose a suitable database region and measure Worker-to-database latency. Evaluate placement options before assuming execution closest to the user is best for a database-heavy route.

## PostgreSQL is the shared limit

Workers can accept traffic faster than PostgreSQL can serve it. Hyperdrive pools connections; it does not add database CPU or fix slow SQL.

1. Index posts by author/date, grants by recipient/post, friendships in both lookup directions, messages by conversation/time/ID, and jobs by state/due time.
2. Use bounded cursor pagination and inspect actual query plans. Avoid unbounded archive scans and N+1 author/permission lookups.
3. Keep transactions short. Never hold a database transaction open while calling R2, FCM, or a Durable Object.
4. Follow the PostgreSQL driver's Worker connection lifecycle and test through Hyperdrive. Coordinate pool limits with the origin database; do not stack poolers without checking compatibility.
5. Use atomic constraints for daily posts, invitation claims, message idempotency, and strict upload quotas.

Upgrade database capacity after measuring slow queries, CPU, pool saturation, and storage. Consider read replicas only when read load justifies them, and keep permission checks and read-after-write flows off stale replicas.

## Cache only where freshness permits

Start with Hyperdrive query caching disabled for the application connection. Its query cache is enabled by default, and writes do not invalidate matching cached reads. Stale session, friendship, block, or message results are correctness and privacy risks.

Static assets and public daily prompts are safer cache candidates. Add separate cache-enabled paths only when stale results are acceptable. Personalised responses must never enter an unscoped shared CDN/Next.js cache. Keep private API responses `no-store` initially.

Owner-scoped recap caches need explicit invalidation after edits/deletes and permission checks before delivery. Measure whether SQL aggregation is already fast enough before adding another cache.

## Media and expensive processing

Upload/download directly through authorised R2 requests. Keep the API responsible for access and metadata rather than proxying every photo byte.

Proposed starting limits are one primary photo, a thumbnail, and one-second optional audio, totalling at most 5 MB per post. Aim for a roughly 1 MB compressed primary photo. Enforce reservation, completion, and per-account limits server-side. Clean abandoned objects after a documented grace period.

Validate real media types and decoding limits. Keep images pending until required checks pass. If safe validation, scanning, or future video transcoding exceeds Worker CPU/memory limits, use a bounded processing service. That is a reason to add a worker service, not rewrite the whole API.

Account for storage operations, retained originals, processing, and backups. R2's lack of direct egress fees does not make every connected service or operation free. Do not erase users' memories when a quota is reached; pause new uploads and provide an upgrade/export policy.

## Durable Object cost and reliability

One logical object per user is not one always-running server per user. Objects activate as needed. Charges depend on requests, applicable WebSocket message accounting, active duration, and storage, not a fixed subscription for every object ID.

Use SQLite-backed Durable Object classes for the Free-plan-compatible option and the WebSocket Hibernation API. Idle eligible objects can avoid duration charges while connections remain open. Stored state still incurs applicable storage usage. Active duration is billed using the configured platform allocation, currently 128 MB per object, even if the handler uses less.

Avoid repeating timers and unnecessary application heartbeats that keep objects awake. Use supported automatic WebSocket responses for heartbeat handling where appropriate. Native protocol ping support differs between browsers and mobile libraries, so test both. Expiry/revocation work must still run; never trade security for hibernation.

Limit sockets per account and frame sizes. Coalesce duplicate invalidations, debounce optional typing/presence, and back off reconnects. Restore attachment state after hibernation. On a lost connection, fetch history by cursor and deduplicate IDs; the socket is not a durable queue.

Per-user objects suit cross-device notifications. A single object for every account would create a hotspot. Grouping users or switching to per-conversation objects is a later measured trade-off, not an automatic cost saving.

## Jobs and safe retries

Persist mutations and their outbox events in one transaction. Retry external delivery outside that transaction. `waitUntil` can support a bounded immediate attempt but is not durable job storage.

Use leases, dedupe keys, capped exponential backoff, attempt limits, and a failed-job state for operator review. Monitor oldest pending work, not just the number of jobs. A queue does not solve overload if consumers cannot keep up.

Begin with the PostgreSQL outbox and scheduled batches. Add Cloudflare Queues when dispatch throughput or isolation warrants it. If introduced, retain the transactional outbox to bridge database commit and queue publication. Consumers remain idempotent, and media processing gets separate concurrency limits.

## Observability, abuse, and cost

| Measure | Investigate or change when |
| --- | --- |
| API p95 and unexpected errors | Defined targets fail under the recorded workload. |
| SQL duration, CPU, pool wait | Queries remain slow after indexing/bounding, or connection waits rise. |
| Oldest outbox/reminder age | Dispatch cannot keep up or provider retries dominate. |
| Durable Object duration, wakeups, reconnects | Objects stay active while idle or clients reconnect repeatedly. |
| Storage, operations, database/Worker quotas | Forecast exceeds included capacity or the agreed budget. |
| Upload failure rate and client timings | Real-device networks or processing prevent useful interaction. |

Initial targets are warm metadata API p95 below 500 ms with fewer than 1% unexpected errors; normal message persistence-to-visible-update p95 below two seconds; due reminder dispatch within two minutes. Report cold starts, degraded-provider behaviour, and OS push arrival separately. A feed should become useful within two seconds after metadata arrives on the recorded mid-range device/network.

Run ramp, burst, sustained, cold-start, and recovery tests in authorised staging environments. Record region, provider plan, hardware, payloads, friend counts, dataset size, and request mix. Do not load-test shared free services without permission.

Use Workers rate limiting for abuse reduction, but its counters are location-local and eventually consistent. Exact daily quotas and resource reservations belong in transactional storage. Fail safely on sensitive operations rather than defaulting to unlimited requests.

Set billing alerts and application-enforced limits. Check account-specific Free allowances before deployment; Free exhaustion can reject requests rather than transparently scale. Budget for PostgreSQL upgrades, stored memories, backups, Workers usage, email, domain, and mobile distribution. No permanent zero-cost claim.

## Releases, recovery, and growth decisions

Installed mobile apps outlive a web deploy. Version APIs, prefer additive migrations, test older clients, and document rollback. A monorepo coordinates changes but cannot update every user's phone at once.

Back up PostgreSQL and media and test restoration. Provider encryption at rest is not a backup. Define acceptable data loss and restore time before a real launch; choose backup frequency and hosting plans to meet those targets.

Add infrastructure only for a measured need: more database capacity for sustained SQL pressure, Queues for job backlog, a processing service for heavy media, or a Node host for required runtime dependencies. The domain services and REST contract should survive those changes.

## References

- [Hyperdrive query caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/)
- [Durable Object WebSockets and hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- [Durable Object pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Workers rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Cloudflare Queues](https://developers.cloudflare.com/queues/)
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Supabase pricing](https://supabase.com/pricing)
