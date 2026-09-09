# Scalability

Design for midnight bursts, database pressure, and retained media. Registered-user counts alone do not establish load. These are test assumptions, not proven capacity:

| Stage | Daily users | Midnight viewers | Photo growth/month |
| --- | --- | --- | --- |
| Course | 100 | 50 | Up to 75 GB |
| Pilot | 500 | 200 | Up to 375 GB |
| Growth | 5,000 | 1,000 | Up to 3.75 TB |

Storage shows the worst case at the 25 MB per-post upload cap over 30 days. Actual growth should be measured because client compression and posts with fewer attachments may reduce it. Figures exclude thumbnails, revisions, and backups. At growth scale, 1,000 viewers making three requests over ten seconds means roughly 300 requests/second. Include socket handshakes and message-triggered fetches separately.

For index candidates, transaction boundaries, leases, and socket expiry mechanisms, see the [implementation reference](implementation-reference.md).

## Build these controls now

| Area | Rule |
| --- | --- |
| Midnight | Check `release_at` on reads. Paginate feeds, load thumbnails, batch pushes, and jitter retries. |
| PostgreSQL | Pool through Hyperdrive, index feed/permission/message queries, avoid N+1 queries, keep transactions short. |
| Caching | Disable Hyperdrive query caching initially. Never serve stale auth/permission checks or shared private responses. |
| Media | Direct R2 transfer, compression, upload quotas, safe validation, and orphan cleanup. |
| Realtime | Hibernation, per-account connection limits, bounded frames, reconnect backoff, history catch-up. |
| Mutations | Idempotency keys and database constraints. Commit content and outbox events together. |
| Jobs | Bounded batches, leases, capped retries, dedupe keys, and failed-job review. |
| Releases | Version APIs and use additive migrations while older mobile clients remain installed. |

Workers scaling does not add PostgreSQL capacity. Measure origin latency and pool saturation; do not blindly stack poolers or reuse process-global connections. Hyperdrive caching is enabled by default and writes do not invalidate cached reads, so explicitly configure fresh application reads.

## Durable Object costs

A per-user object is a logical coordinator, not a rented server. Costs depend on requests, applicable WebSocket billing, active duration, and storage. SQLite-backed objects support the Free-plan option within its limits.

Hibernation keeps idle sockets connected without duration charges while eligible. Repeating timers or frequent application heartbeats can defeat it. Active duration currently uses a 128 MB allocation per object regardless of actual memory use. Expiry/revocation must still work after hibernation.

## Measure and upgrade

Start with warm API p95 below 500 ms, fewer than 1% unexpected errors, healthy realtime updates below two seconds p95, and reminder dispatch within two minutes. Measure cold starts and OS notification delivery separately.

Run authorised staging burst, sustained, cold-start, and recovery tests. Record region, provider plan, network, hardware, dataset, friend counts, and payload sizes. Monitor SQL time, pool waits, oldest job age, reconnects, object duration, upload failures, and quota forecasts.

Upgrade database capacity after query optimisation. Add Cloudflare Queues for measured job backlog, retaining the transactional outbox. Add a processing service for work that exceeds Worker limits. No Kubernetes, sharding, or microservices yet.

Cloudflare rate limits are location-local and approximate; exact quotas belong in transactional storage. Billing alerts are not spending caps. Plan for paid storage/database capacity, email, distribution, and backups. Test database/media restoration against the 24-hour RPO and 8-hour RTO. Never delete memories simply because a free tier fills.

[Hyperdrive caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/) · [Hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) · [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) · [R2 pricing](https://developers.cloudflare.com/r2/pricing/) · [Supabase pricing](https://supabase.com/pricing)
