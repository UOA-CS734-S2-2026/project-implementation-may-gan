# Dayli architecture proposal

Status: proposal, not implemented. Revised on 8 September 2026.

Dayli helps university students keep up with close friends through one daily reflection. A phone fits that habit. Users can capture a moment, finish an entry later, and receive a reminder before the day closes. The web app gives them room to explore longer mood histories and look back through their year.

Keep Flutter for mobile and Next.js for web. Keep PostgreSQL, Drizzle, Better Auth, and the existing messaging business logic. Introduce a shared REST/OpenAPI contract inside the Next.js backend and migrate the web client from tRPC gradually. Use managed realtime delivery for updates, private object storage for media, and scheduled jobs for reminders.

## Privacy decision

The team chose an Instagram-style security model for both posts and messages. Use HTTPS, provider encryption at rest, and strict server-side access controls. Dayli's backend can read content. There is no end-to-end encryption, Matrix service, device-to-device key distribution, or user-held encryption recovery code.

Solo entries stay owner-only through application access controls. Friends' posts still unlock at Auckland midnight. Biometric app lock protects local access, not content from the backend. Normal account recovery restores account access and server-held history.

## Read in this order

1. [MVP and delivery plan](mvp.md) explains the experience and build phases.
2. [Existing implementation](existing-implementation.md) records what to keep, adapt, replace, or add.
3. [Tech stack](tech-stack.md) names the tools and hosting trade-offs.
4. [Architecture](architecture.md) explains the shared API, data model, and request flows.
5. [Security and privacy](security.md) defines access controls and threat boundaries.
6. [Testing and delivery](testing-and-delivery.md) covers acceptance tests, performance, and course evidence.

## Agreed constraints

- Four developers, Flutter on iOS and Android, and Next.js for web.
- One posting day and midnight release in `Pacific/Auckland`.
- All requested additions remain in scope, with supported platform-specific fallbacks. The original E2EE request has been superseded by the privacy decision above.
- Both apps support messaging and synced server-held history.
- Offline drafts survive restarts. Submission must reach the backend before midnight to count for that day.
- Share links require signup and grant access to one selected post, not automatic friendship.
- Prefer free tiers with limited spending when needed. Unlimited free hosting is not promised.
- The team reports lecturer approval to reuse the Dayli idea. Record that approval in the course repository.

## Where the work belongs

`UOA-CS734-S2-2026/project-implementation-may-gan` is the primary course repository. Use its issues, project board, pull requests, and meeting records. The WDCC repository supplies reusable code and holds a secondary copy of these documents. It is not a second place to track assessed work.

Dependency versions, native login, realtime delivery, and platform-specific integrations need implementation tests. This proposal does not claim those integrations already work.
