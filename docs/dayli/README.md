# Dayli developer guide

Status: web, mobile, API, and local database foundations are implemented. Staging and production auth are not deployed.

Dayli lets students share one daily reflection with friends. Capture on Flutter; reflect through Next.js calendars, mood history, and recaps. Web also supports posting and messaging.

Both apps use a Hono API on Cloudflare Workers. Keep PostgreSQL, Drizzle, Better Auth, and useful existing code. Use R2 for media and Durable Objects/WebSockets for realtime.

## Read by topic

- [Environments](environments.md): implemented local HTTPS sign-in, unprovisioned staging, and the separate production reset and release boundary.
- [MVP](mvp.md): features and build order.
- [Existing code](existing-implementation.md): reuse and known gaps.
- [Tech stack](tech-stack.md): tools and deployment.
- [Architecture overview](../../apps/docs/content/docs/systems/architecture-overview.mdx): current components and request flows.
- [Backend architecture](../backend-architecture.md): agreed action slices, file naming, layers, authentication middleware, and testing boundaries.
- [Backend refactor implementation](../implementation/backend-refactor.md): behavior-preserving migration sequence and acceptance checks.
- [Messaging](../../apps/docs/content/docs/systems/messaging/index.mdx): current REST, WebSocket, outbox, and push behavior.
- [Messaging design history](../../apps/docs/content/docs/systems/messaging/design-history-and-lessons.mdx): alternatives, lessons, source issues, and deferred boundaries.
- [Scalability](scalability.md): capacity, costs, and upgrade triggers.
- [Security](security.md): privacy and permissions.
- [Authentication security and verification](../../apps/docs/content/docs/systems/accounts-and-authentication/security-and-verification.mdx): Better Auth Worker and Flutter proof, plus deployment prerequisites.
- [Continuous integration](continuous-integration.md): automatic pull request checks, branch protection, and deployment boundary.
- [Testing and delivery](testing-and-delivery.md): release checks and team workflow.
- [Database migrations](database-migrations.md): Neon PostgreSQL roles, additive migration commands, and release runbook.
- [Implementation reference](../implementation/implementation-reference.md): detailed mechanisms, pitfalls, and readiness checklist.
- [Product decisions](product-decisions.md): agreed permissions, limits, retention, and reuse rules.
- [API conventions](api-conventions.md): versioning, JSON, errors, pagination, authentication, and OpenAPI.
- [API client generation](client-generation.md): regenerate and verify the TypeScript and Dart clients.
- [Media uploads and storage](../../apps/docs/content/docs/systems/media-uploads-and-storage/index.mdx): private R2 reservations, validation, reads, and cleanup.
- [Daily posts and release timing](../../apps/docs/content/docs/systems/daily-posts-and-release-timing/index.mdx): server-owned Auckland days, idempotent acceptance, and release.
- [Friends and feed visibility](../../apps/docs/content/docs/systems/friends-and-feed-visibility/index.mdx): relationships, profile visibility, and the one-day feed.
- [Profiles and discovery](../../apps/docs/content/docs/systems/friends-and-feed-visibility/profiles-and-discovery.mdx): profile projections, streaks, usernames, and avatars.
- [Reflection and history](../../apps/docs/content/docs/systems/reflection-and-history/index.mdx): profile archives, post detail, edits, revisions, tomorrow notes, and Trash limits.
- [Likes and comments](likes-and-comments.md): liking, threaded comments, moderation, and who sees which.
- [On This Day](on-this-day.md): `GET /api/v1/me/memories/on-this-day`, the owner's own earlier posts from today's Auckland date, and leap-day handling.

## Fixed rules

One post per Auckland day, released at midnight. Server acceptance determines eligibility; offline drafts cannot be backdated. Solo entries stay owner-only. Public accounts can create revocable, unlisted links to released non-solo posts; private-account links grant no access.

Content is server-readable, protected by HTTPS, encryption at rest, and permissions. No end-to-end encryption. Normal account recovery restores server history.

Use the May Gan monorepo and course GitHub board. Andrew Meads approved frontend reuse around August 2026, subject to rebuilding the backend and attributing imported WDCC code. Prefer free tiers without promising permanently free hosting.
