# Existing implementation

Reference repository: `732-workspace/group-project-wdcc`, commit `7d2dfd6`, reviewed from `hotfix/ratelimit-fail-open`. This was a targeted source review, not a full audit or runtime test run.

## Keep and adapt

| Existing code | Finding | Recommendation |
| --- | --- | --- |
| `package.json` | Next.js 16.2, React 19, tRPC 11, TanStack Query, Zod, Drizzle, Better Auth, Cloudinary, Upstash | Keep the main framework, database, auth, validation, and query libraries. Replace the client API contract gradually. |
| `server/api/routers/*` | Schemas, handlers, services, and tests are separated by domain | Keep this structure. Remove transport-specific errors and request contexts from reusable services. |
| `lib/db/schemas/posts-schema.ts` | Plaintext application fields, rating check, unique author/date index, ordered image/video media | Retain server-readable fields and relational constraints. Add audience, release time, revision, and private media lifecycle. |
| `server/api/routers/posts/createPost/createPost.service.ts` | Checks the Auckland date and writes post/media transactionally | Keep. Add idempotency, completed-upload ownership checks, and concurrent unique-conflict handling. |
| `server/api/routers/posts/getMoodWeek/getMoodWeek.service.ts` | Queries weekly ratings with SQL | Keep and extend to date ranges and recap aggregates. This is compatible with the revised privacy decision. |
| `server/api/routers/users/getCurrentStreak/getCurrentStreak.service.ts` | Computes streaks from posting dates | Reuse its calendar-date approach and test daylight-saving boundaries. |
| `server/api/routers/friends/` | Requests, acceptance, decline, cancellation, removal, lists, counts, and status | Keep workflows. Add blocks and post-level sharing checks. |
| `components/ui/PostCard.tsx`, `components/ui/MoodWeekGraph.tsx`, `app/(main)/post/_components/PostForm.tsx` | Existing web post, mood, and composer UI | Retain useful components and web posting. Add archive and year-in-review views. |
| `server/api/routers/messages/sendMessage/sendMessage.service.ts` | Stores message bodies in PostgreSQL, checks participants and request status, updates conversation activity | Keep this backend. Add concurrency-safe request limits, idempotency, durable events, and retention controls. |
| `components/messages/`, other message services | Conversation lists, request acceptance, read state, and chat UI | Adapt to shared REST and managed realtime notifications. No Matrix migration. |
| `lib/auth/index.ts` | Better Auth with email/password, Google, username, and admin plugins | Retain identity provider. Prove native sessions and recovery flows. Supabase currently supplies PostgreSQL, not authentication. |
| `.github/workflows/ci.yml` | Lint, formatting, types, PostgreSQL tests, browser setup, schema checks, build | Port to course repo. Add Flutter, contract, realtime, and performance tests. |

There are 41 server test files. This establishes existing test infrastructure, not passing coverage. The build workflow uses configured secrets; new pull-request builds should not require production credentials.

## Fix permission and calendar gaps

The README describes friends-only content, but the code also permits public-profile posts. `server/api/lib/visibility.ts` returns public posts before checking authentication. `getUserPostsService` permits public access too. Public profile discoverability must not imply access to journal content in the revised app.

Existing `private` profile visibility means friends plus owner, not a solo journal. Add a separate post audience with an explicit owner-only option.

`getFeedService` selects yesterday's friends' posts, but the shared visibility helper and profile-post query do not apply the same midnight gate. Centralise the check across posts, media, previews, comments, likes, and sharing. The owner may read their own entry early; other viewers must satisfy the release rule.

The feed computes yesterday by subtracting 24 hours. Replace that with Auckland calendar arithmetic. Days around daylight-saving changes are not always 24 hours long.

## Replace delivery, not the message model

`lib/messages/pubsub.ts` uses a process-local subscriber map. `app/api/messages/stream/route.ts` exposes authenticated SSE, but events and connection limits do not cross instances. There is no durable replay, and a crash between committing a message and publishing its event can lose the update.

Retain PostgreSQL as the message source of truth. Write an outbox record in the same transaction as a message, then publish a minimal invalidation through Ably. Clients fetch authorised messages through REST. Reconnects fetch missed history using a cursor. Managed realtime replaces the process-local delivery mechanism, not the stored conversation model.

## Media and deployment

`app/api/cloudinary/sign/route.ts` signs image/video uploads, and `post_media` stores Cloudinary IDs and URLs. Upload authentication does not by itself establish private download access. Do not retain permanent public post URLs for friends-only or solo content.

Recommend private R2 objects with API-authorised short-lived downloads. Cloudinary can remain for explicitly public avatars. Retaining Cloudinary for posts is an alternative only after proving its authenticated delivery, expiry, transformation access, and plan costs. Client-side image compression can stay; server-side processing is now permitted when useful.

`fly.toml` defines a Sydney machine that may stop at zero traffic. Preserve Docker portability, but do not use an in-process timer as the sole source of scheduled reminders.

## Import boundaries

Import reusable application code into the course repository with attribution and reuse permission. Exclude `.env`, caches, build output, and `node_modules`. Preserve the course README and submission history. Distinguish imported work from new implementation in pull requests.

There are no real user migrations to preserve. A fresh development database is reasonable. That does not authorise deleting an existing hosted database or changing shared credentials during documentation work.
