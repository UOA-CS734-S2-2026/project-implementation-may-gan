# Dayli developer guide

Status: web, mobile, API, and local database foundations are implemented. Staging and production auth are not deployed.

Dayli lets students share one daily reflection with friends. Capture on Flutter; reflect through Next.js calendars, mood history, and recaps. Web also supports posting and messaging.

Both apps use a Hono API on Cloudflare Workers. Keep PostgreSQL, Drizzle, Better Auth, and useful existing code. Use R2 for media and Durable Objects/WebSockets for realtime.

## Read by topic

- [Environments](environments.md): implemented local HTTPS sign-in, unprovisioned staging, and the separate production reset and release boundary.
- [MVP](mvp.md): features and build order.
- [Existing code](existing-implementation.md): reuse and known gaps.
- [Tech stack](tech-stack.md): tools and deployment.
- [Architecture](architecture.md): current components and request flows.
- [Backend architecture](../backend-architecture.md): agreed action slices, file naming, layers, authentication middleware, and testing boundaries.
- [Backend refactor implementation](../implementation/backend-refactor.md): behavior-preserving migration sequence and acceptance checks.
- [Messaging implementation handoff](../implementation/messaging-implementation-handoff.md): proposed Hono APIs, database design, WebSockets, mobile push, file responsibilities, and validation. Not implemented yet.
- [Messaging ticket map](../implementation/messaging-ticket-map.md): existing issue updates, new pieces, dependencies, and blocked group/media follow-ups.
- [Scalability](scalability.md): capacity, costs, and upgrade triggers.
- [Security](security.md): privacy and permissions.
- [Authentication compatibility](authentication-compatibility.md): Better Auth Worker and Flutter proof, plus deployment prerequisites.
- [Continuous integration](continuous-integration.md): automatic pull request checks, branch protection, and deployment boundary.
- [Testing and delivery](testing-and-delivery.md): release checks and team workflow.
- [Database migrations](database-migrations.md): Neon PostgreSQL roles, additive migration commands, and release runbook.
- [Implementation reference](../implementation/implementation-reference.md): detailed mechanisms, pitfalls, and readiness checklist.
- [Product decisions](product-decisions.md): agreed permissions, limits, retention, and reuse rules.
- [API conventions](api-conventions.md): versioning, JSON, errors, pagination, authentication, and OpenAPI.
- [API client generation](client-generation.md): regenerate and verify the TypeScript and Dart clients.
- [Media reservations](media-reservations.md): R2 presigned upload reservations, one-time bucket setup, and quota/expiry defaults.
- [Daily post creation](daily-posts.md): the idempotent `POST /api/v1/posts` contract, deadline checks, and conflict reasons.
- [Friends feed](friends-feed.md): who can see which posts in `GET /api/v1/feed`, and its pagination.
- [Post detail](post-detail.md): `GET /api/v1/posts/{postId}`, who can read one post, and 404 concealment.
- [Profiles](profiles.md): profile details, who sees the bio, editing, and username changes.
- [Profile archive](profile-archive.md): `GET /api/v1/profiles/{username}/posts`, who sees which posts on a profile.
- [Future-self notes](future-self-notes.md): owner-only notes scheduled for an Auckland date, early-access rules, and the delivery job.

## Fixed rules

One post per Auckland day, released at midnight. Server acceptance determines eligibility; offline drafts cannot be backdated. Solo entries stay owner-only. Public accounts can create revocable, unlisted links to released non-solo posts; private-account links grant no access.

Content is server-readable, protected by HTTPS, encryption at rest, and permissions. No end-to-end encryption. Normal account recovery restores server history.

Use the May Gan monorepo and course GitHub board. Andrew Meads approved frontend reuse around August 2026, subject to rebuilding the backend and attributing imported WDCC code. Prefer free tiers without promising permanently free hosting.
