# Dayli proposal

Status: design only, not implemented.

Dayli lets students share one daily reflection with friends. Capture on Flutter; reflect through Next.js calendars, mood history, and recaps. Web also supports posting and messaging.

Both apps use a Hono API on Cloudflare Workers. Keep PostgreSQL, Drizzle, Better Auth, and useful existing code. Use R2 for media and Durable Objects/WebSockets for realtime.

## Read by topic

- [MVP](mvp.md): features and build order.
- [Existing code](existing-implementation.md): reuse and known gaps.
- [Tech stack](tech-stack.md): tools and deployment.
- [Architecture](architecture.md): components and request flows.
- [Scalability](scalability.md): capacity, costs, and upgrade triggers.
- [Security](security.md): privacy and permissions.
- [Testing and delivery](testing-and-delivery.md): release checks and team workflow.
- [Implementation reference](implementation-reference.md): detailed mechanisms, pitfalls, and readiness checklist.
- [Product decisions](product-decisions.md): agreed permissions, limits, retention, and reuse rules.
- [API conventions](api-conventions.md): versioning, JSON, errors, pagination, authentication, and OpenAPI.
- [API client generation](client-generation.md): regenerate and verify the TypeScript and Dart clients.

## Fixed rules

One post per Auckland day, released at midnight. Server acceptance determines eligibility; offline drafts cannot be backdated. Solo entries stay owner-only. Public accounts can create revocable, unlisted links to released non-solo posts; private-account links grant no access.

Content is server-readable, protected by HTTPS, encryption at rest, and permissions. No end-to-end encryption. Normal account recovery restores server history.

Use the May Gan monorepo and course GitHub board. Andrew Meads approved frontend reuse around August 2026, subject to rebuilding the backend and attributing imported WDCC code. Prefer free tiers without promising permanently free hosting.
