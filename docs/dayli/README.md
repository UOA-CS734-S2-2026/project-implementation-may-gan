# Dayli architecture proposal

Status: proposed design, not implemented.

Dayli helps university students share one daily reflection with close friends. Mobile leads with camera capture and reminders. Web retains posting and messaging, while adding a calendar, mood history, and year-in-review.

## Decisions

- Flutter for iOS/Android, Next.js for web, and a separate Hono API on Cloudflare Workers.
- Keep PostgreSQL, Drizzle, Better Auth, and useful WDCC services and tests.
- REST/OpenAPI for both clients. Durable Objects and WebSockets replace process-local SSE and the earlier Ably proposal.
- R2 for private media, Hyperdrive for PostgreSQL connections, and Worker scheduled handlers for jobs.
- One monorepo in `project-implementation-may-gan`, with separate web and API deployments.

Posts and messages use HTTPS, encryption at rest, and server-side access controls. The backend can read them. There is no end-to-end encryption or Matrix service. Normal account recovery restores server-held history; biometric lock protects local access.

## Developer reading guide

| Document | Read it for |
| --- | --- |
| [MVP](mvp.md) | User experience, full feature scope, platform fallbacks, and build phases. |
| [Existing implementation](existing-implementation.md) | Code to keep, adapt, or replace. |
| [Tech stack](tech-stack.md) | Frameworks, providers, deployment, and remaining compatibility checks. |
| [Architecture](architecture.md) | API boundaries, database changes, posting, realtime, and jobs. |
| [Scalability](scalability.md) | Midnight load, database capacity, media costs, Durable Objects, and upgrade triggers. |
| [Security](security.md) | Permissions, sessions, local protection, and OWASP controls. |
| [Testing and delivery](testing-and-delivery.md) | Release tests, migration, CI, and course evidence. |

## Product rules

One post per day, with a shared release at midnight in `Pacific/Auckland`. The server decides submission eligibility. Offline drafts survive restarts, but must reach the backend before midnight to count for that day. Solo entries are owner-only unless explicitly shared. Selected-post links require signup and do not create friendships.

All agreed additions remain in the course scope with supported platform fallbacks. Prefer free tiers, but budget for real storage, database capacity, and distribution costs as usage grows.

## Repository and course boundaries

The four-person team works in `UOA-CS734-S2-2026/project-implementation-may-gan`. Use its board, issues, reviewed PRs, and weekly minutes for assessed evidence. WDCC supplies reusable code and receives a reference copy of these docs.

The team reports lecturer approval to reuse the idea. Record that approval and code attribution in the course repo. No application code, infrastructure, or hosted data has been changed by this proposal. Native auth, Worker dependencies, and Next.js hosting compatibility still need tests.
