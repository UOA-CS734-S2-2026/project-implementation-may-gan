# Scalability

Design for midnight bursts, database pressure, and retained media. Registered-user counts alone do not establish load. An API Worker is deployed in staging, but no capacity run exists. These remain test assumptions, not proven capacity:

| Stage | Daily users | Midnight viewers | Photo growth/month |
| --- | --- | --- | --- |
| Course | 100 | 50 | Up to 75 GB |
| Pilot | 500 | 200 | Up to 375 GB |
| Growth | 5,000 | 1,000 | Up to 3.75 TB |

Storage shows the worst case at the 25 MB per-post upload cap over 30 days. Actual growth should be measured because client compression and posts with fewer attachments may reduce it. Figures exclude thumbnails, revisions, and backups. At growth scale, 1,000 viewers making three requests over ten seconds means roughly 300 requests/second. Include socket handshakes and message-triggered fetches separately.

For index candidates, transaction boundaries, leases, and socket expiry mechanisms, see the [implementation reference](../implementation/implementation-reference.md).

## Build these controls now

| Area | Rule |
| --- | --- |
| Midnight | Check `release_at` on reads. Paginate feeds, load thumbnails, batch pushes, and jitter retries. |
| PostgreSQL | Pool through Hyperdrive, index feed/permission/message queries, avoid N+1 queries, keep transactions short. |
| Caching | Disable Hyperdrive query caching initially. Never serve stale auth/permission checks or shared private responses. |
| Media | Direct R2 transfer, compression, upload quotas, safe validation, and orphan cleanup. |
| Realtime | Hibernation, per-account connection limits, bounded frames, jittered reconnect backoff, versioned change catch-up, and coalesced REST refreshes. No periodic client polling. |
| Mutations | Idempotency keys and database constraints. Commit content and outbox events together. |
| Jobs | Bounded batches, leases, capped retries, dedupe keys, and failed-job review. |
| Releases | Version APIs and use additive migrations while older mobile clients remain installed. |

Workers scaling does not add PostgreSQL capacity. Measure origin latency and pool saturation; do not blindly stack poolers or reuse process-global connections. Create database clients inside each invocation and let Hyperdrive clean up edge connections. Keep caching disabled unless a separate freshness proof exists; writes do not invalidate cached reads.

## Durable Object costs

A per-user object is a logical coordinator, not a rented server. Costs depend on requests, applicable WebSocket billing, active duration, and storage. SQLite-backed objects support the Free-plan option within its limits.

Hibernation keeps idle sockets connected without duration charges while eligible. Repeating timers or frequent application heartbeats can defeat it. Active duration currently uses a 128 MB allocation per object regardless of actual memory use. Expiry/revocation must still work after hibernation.

## Messaging transport decision

Use hibernating WebSockets in the existing API Worker for foreground notifications, with REST for sending and authorized data retrieval. Attempt outbox dispatch immediately after commit; scheduled retries repair failures rather than provide the normal delivery cadence. FCM/APNs handles suspended mobile apps. The [messaging design history](../../apps/docs/content/docs/systems/messaging/design-history-and-lessons.mdx) records alternatives and implementation boundaries.

This is a stack-fit decision, not proof of the lowest bill. Compare concurrent devices, event frequency, group fan-out if introduced later, query cost, reconnect bursts, and maintenance effort. SSE can carry one-way notifications but should not be assumed to have WebSocket hibernation economics. Managed realtime trades provider charges for less operations work. A dedicated socket service and broker can suit sustained load but add capacity and failover responsibilities. MQTT and database-sync infrastructure are not required for this release.

## Measure and upgrade

Start with warm API p95 below 500 ms, fewer than 1% unexpected errors, healthy realtime updates below two seconds p95, and reminder dispatch within two minutes. Measure cold starts and OS notification delivery separately.

Run authorised staging burst, sustained, cold-start, and recovery tests. Record region, provider plan, network, hardware, dataset, friend counts, and payload sizes. Monitor SQL time, pool waits, oldest job age, reconnects, object duration, upload failures, and quota forecasts.

Upgrade database capacity after query optimisation. Add Cloudflare Queues for measured job backlog, retaining the transactional outbox. Add a processing service for work that exceeds Worker limits. No Kubernetes, sharding, or microservices yet.

Cloudflare rate limits are location-local and approximate; exact quotas belong in transactional storage. Billing alerts are not spending caps. Plan for paid storage/database capacity, email, distribution, and backups. Test database/media restoration against the 24-hour RPO and 8-hour RTO. Never delete memories simply because a free tier fills.

[Hyperdrive caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/) · [Hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) · [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) · [R2 pricing](https://developers.cloudflare.com/r2/pricing/) · [Neon pricing](https://neon.com/pricing)
