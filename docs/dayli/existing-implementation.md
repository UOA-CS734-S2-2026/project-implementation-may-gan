# Existing code

Reference: `732-workspace/group-project-wdcc`, commit `7d2dfd6`. Targeted source review only, not a runtime/security audit.

## Reuse decisions

| Existing area | Action |
| --- | --- |
| Next.js UI, TanStack Query | Keep components, composer, mood chart, and messaging UX. |
| `server/api/routers/*` | Reuse services/tests; replace tRPC adapters with Hono REST. Remove transport-specific contexts/errors. |
| `lib/db/schemas/*` | Keep PostgreSQL/Drizzle and content fields. Add audiences, release times, immutable revisions, account-level public visibility, and jobs. |
| Post/mood/streak services | Keep SQL and constraints; add idempotency and calendar tests. |
| Friend/comment/like services | Keep workflows; centralise permissions and add blocks. |
| Messaging services | Keep PostgreSQL history/read state; add transactional request limits and outbox. |
| `lib/messages/pubsub.ts`, message SSE route | Replace process-local delivery with Durable Objects/WebSockets. |
| `lib/auth/index.ts` | Move Better Auth authority into Hono; test Worker/native compatibility. |
| Cloudinary uploads, Upstash limiter | Move toward R2 and Cloudflare controls, preserving tested policies. |
| CI/deployment | Reuse tests; create separate Worker/web release targets. |

## Known gaps

`visibility.ts` and profile-post queries permit public content and do not consistently enforce midnight. Existing private profiles mean friends plus owner, not solo mode. Centralise access across every route, including media.

The feed subtracts 24 hours to find yesterday. Use Auckland calendar arithmetic instead. Current in-memory messaging events cannot cross instances or survive publication failure. Signed Cloudinary uploads do not prove private download access.

There are 41 server test files, not a verified passing coverage result. Import with attribution and permission, excluding credentials, dependencies, and build artefacts. Use isolated development data; documentation work does not authorise deleting hosted data.

[Migration plan](testing-and-delivery.md). Database rollout controls are in [Database migrations](database-migrations.md).
