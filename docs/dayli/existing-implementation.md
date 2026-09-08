# Existing implementation

Reference: `732-workspace/group-project-wdcc`, commit `7d2dfd6`, reviewed from `hotfix/ratelimit-fail-open`. This was a targeted source review, not a full audit or runtime test run.

## Keep, adapt, replace

| Existing path | Decision |
| --- | --- |
| `package.json`, web components | Keep Next.js/React, Tailwind, TanStack Query, Zod, Drizzle, PostgreSQL, Better Auth, and useful UI. |
| `server/api/routers/*` | Keep domain services/tests. Replace tRPC handlers with Hono REST adapters; remove transport-specific contexts/errors from services. |
| `lib/db/schemas/posts-schema.ts` | Retain content fields, rating checks, author/date uniqueness, and media ordering. Add audience, release time, revisions, and private-object lifecycle. |
| `server/api/routers/posts/createPost/createPost.service.ts` | Keep server date authority and transactions. Add idempotency, owned-upload checks, and race handling. |
| `server/api/routers/posts/getMoodWeek/getMoodWeek.service.ts`, user streak service | Keep SQL mood queries and calendar-based streaks; extend bounded history/recaps. |
| `server/api/routers/friends/`, comments and likes | Keep workflows; add blocks and shared post-level visibility rules. |
| `server/api/routers/messages/`, `components/messages/` | Keep PostgreSQL message/history/read-state model and acceptance UX. Add idempotency, transactional request limits, and outbox events. |
| `lib/messages/pubsub.ts`, `app/api/messages/stream/route.ts` | Replace process-local SSE with per-user Durable Objects and WebSockets. |
| `lib/auth/index.ts` | Move Better Auth authority to Hono. Prove Worker dependencies, native sessions, and recovery. Supabase currently hosts PostgreSQL, not auth. |
| `app/api/cloudinary/sign/route.ts` | Replace private-post delivery with R2. Cloudinary public avatars may stay temporarily. |
| `lib/ratelimit.ts` | Port policy tests; replace Upstash with Cloudflare abuse controls and strict database quotas. Do not inherit fail-open behaviour blindly. |
| `.github/workflows/ci.yml`, `fly.toml` | Reuse CI lessons and deployment fallback, but create separate Worker/web release targets in the course repo. |

The source tree contains 41 server test files. That establishes useful infrastructure, not passing tests or coverage. New PR builds must not require production credentials.

## Known permission and calendar gaps

The README says friends-only, but `server/api/lib/visibility.ts` and `getUserPostsService` also permit public-profile posts. Separate profile discovery from journal access. Existing `private` visibility means friends plus owner, not solo mode.

`getFeedService` filters yesterday's friends' posts, while detail/profile helpers do not apply the same release rule. Centralise midnight checks across all routes, including media, previews, comments, and sharing. Replace its 24-hour subtraction with Auckland calendar arithmetic and daylight-saving tests.

Existing message publication happens after commit through an in-memory map. Events do not cross instances and can be lost on a crash. Keep PostgreSQL history, add a transactional outbox, and deliver small updates through Durable Objects. Reconnect fetches missed history through REST.

Signing a Cloudinary upload does not prove the resulting URL is private. Do not carry permanent public post URLs into the new private-media design.

## Import boundaries

Import into the course repo with reuse permission and source attribution. Exclude `.env`, `.dev.vars`, caches, build output, and dependencies. Preserve the course README/submission history and distinguish imported code from new contributions.

A fresh development database is reasonable because there are no real users to migrate. That does not authorise destructive changes to existing hosted data or credentials. See [Testing and delivery](testing-and-delivery.md) for the migration sequence.
