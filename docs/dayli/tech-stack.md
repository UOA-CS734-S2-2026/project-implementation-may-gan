# Tech stack

## Recommendation

Keep the existing backend rather than replacing it with a separate framework. Both clients use a shared REST API hosted by Next.js. PostgreSQL remains the source of truth for posts, messages, relationships, and scheduled work.

| Layer | Choice | Reason |
| --- | --- | --- |
| Mobile | Flutter, Riverpod, GoRouter, Dio | Cross-platform UI, testable state, deep links, and HTTP handling. |
| Local persistence | Drift/SQLite for cached records and drafts, protected through a tested encryption-at-rest layer; Keychain/Keystore-backed credential storage | Drafts survive restarts. Local protection does not introduce cross-device encryption keys or recovery codes. |
| Native capabilities | `camera`, `geolocator`, `record`, `local_auth`, `firebase_messaging`, `flutter_local_notifications`, `battery_plus` | Validate packages on physical devices. Use Swift/Kotlin channels for missing screenshot and assistant APIs. |
| Web | Existing Next.js, React, Tailwind, TanStack Query | Reuse working UI and query patterns. Add reflection views. |
| Shared API | Next.js Node-runtime Route Handlers, REST/JSON, Zod, OpenAPI | Serves Dart and TypeScript without a backend framework rewrite. |
| Contracts | Zod-to-OpenAPI tooling, `openapi-typescript`, OpenAPI Generator `dart-dio` | Generate compatible client models from one contract. Pin versions and test supported schema types. |
| Auth | Better Auth, secure browser sessions, Bearer plugin for native sessions | Retain current identity and profile integration. Prove mobile login, expiry, logout, and recovery. |
| Database | Supabase-hosted PostgreSQL and Drizzle | Retains schema, SQL queries, message history, and existing tests. |
| Realtime | Ably Pub/Sub, Flutter and JavaScript SDKs | Replaces process-local SSE without operating a persistent socket server. Use event notifications, not Ably as a second message database. |
| Media | Private Cloudflare R2 Standard objects and signed downloads | Private media access remains under Dayli's API permissions. Keep Cloudinary for public avatars if useful. |
| Jobs | PostgreSQL outbox/jobs and a Cloudflare Worker Cron Trigger calling a protected API endpoint | Durable reminder and notification work without a new queue server. |
| Push | FCM, with APNs delivery on Apple devices | Background reminders and messaging notifications. |
| Rate limits | Existing Upstash, plus SQL-enforced quotas and invariants | Central limits across API instances. Set an explicit provider-outage policy. |
| Tests | Vitest, PostgreSQL integration tests, Playwright, Flutter tests, `integration_test`, k6 | Retains existing tests and adds native and load coverage. |

There is no Matrix server, E2EE SDK, recipient-key directory, cross-signing, or encryption recovery system. Providers protect stored infrastructure data at rest; the application processes content normally after authentication and authorisation.

## Why change tRPC but keep Next.js?

The current tRPC stack shares TypeScript inference with the web client. Dart does not receive that benefit. REST/OpenAPI gives both languages generated DTOs and conventional error semantics without custom SuperJSON or tRPC glue.

Move business logic into transport-independent services. Keep tRPC as a temporary adapter to those services while the web migrates. Do not create two implementations of posting, permission checks, or messaging.

GraphQL would work, but Dayli's first operations are bounded feed, post, archive, message, and friendship requests. Its resolver and authorisation complexity is unnecessary here. Use HTTPS REST for commands/history and Ably's realtime transport for invalidations. Push serves background devices; it is not a replacement for durable history.

## Auth and native integration

Better Auth stays the identity authority. Browser sessions use secure cookies. Flutter stores bearer session tokens in protected native storage. Bearer tokens are not automatically JWTs or OAuth refresh tokens. Use the server library's validation and revocation rules.

Keep email/password and Google login. Prove the native browser handoff with state, exact redirect allowlists, PKCE where supported by the chosen flow, and a short-lived single-use exchange. Never put reusable session credentials in a deep-link URL. Check Sign in with Apple obligations before an App Store release with Google login.

Normal password recovery restores account access to server-held history. Configure an actual email delivery provider, one-time reset tokens, expiry, throttling, and user notifications. Biometric app unlock is separate from account authentication.

## Realtime without a second backend

Use Ably Pub/Sub rather than its separate Chat persistence model. PostgreSQL owns conversations, bodies, read state, and request acceptance. The API issues short-lived subscribe-only tokens for `user:<authenticated-id>` channels. Never accept a requested user ID as authority, grant wildcard access, or ship an Ably API key to either client.

After committing a message, publish only an event ID, conversation ID, and change type to each participant's channel. Clients fetch messages through the authenticated REST API. This keeps permission enforcement and storage in the existing service layer.

A free Ably plan can suit a small prototype, but check current connection, channel, throughput, and monthly message limits. Fan-out to multiple subscribers affects usage. If realtime is unavailable, use bounded foreground-only polling and catch-up on resume. Do not poll every background device continuously.

Self-hosted sockets with Redis are a later alternative if managed-service cost justifies the operations work. Supabase Realtime is also possible, but requires a deliberate Better Auth token and row/channel authorisation integration. Do not assume Supabase-hosted PostgreSQL automatically authenticates Better Auth clients.

## Hosting and budget

Use Vercel Hobby for Next.js only while the project meets its non-commercial terms and quotas. Retain the existing Docker/Fly deployment path if another hosting model fits better. Supabase Free provides application PostgreSQL, R2 holds media, Ably handles realtime, and a small Worker provides scheduling. There is no always-on Matrix VM to fund.

Supabase pricing currently lists 500 MB database storage, 5 GB egress, and pausing after a week of inactivity on Free. Its Auth allowances are not relevant to a Better Auth deployment. R2 has included storage/operation allowances and no direct R2 egress charge, but retained media eventually exceeds free storage. Provider plans and included quotas can change.

Allow for email delivery, domain, backups, Apple signing/distribution, store enrolment, and paid service upgrades. Recheck terms and actual account limits before provisioning. Alerts are not hard spending caps. Add upload quotas, reservation expiry, request limits, bounded job batches, and an operator switch to stop new uploads before uncontrolled growth. Do not delete existing memories when a free tier fills.

## Capacity assumptions

Start with 100 daily active users, 50 simultaneous midnight viewers, and one roughly 1 MB compressed image per user per day. Photos alone add about 3 GB per month and 36.5 GB per year. Audio, thumbnails, backups, messages, and retained revisions add more. These are planning inputs, not measured capacity.

Test 50 viewers making four metadata requests over ten seconds, about 20 requests per second. Measure direct image downloads separately. Then test 500 daily users and 200 simultaneous viewers as a growth scenario. Include chat events and their REST fetches in the load model.

Use pooled database connections, indexed access checks, cursor pagination, and bounded date ranges. API instances stay stateless. Move jobs to a dedicated worker if backlog or dispatch duration exceeds serverless execution limits. Upgrade based on p95 latency, connection saturation, realtime quotas, job lag, and storage growth. No Kubernetes or microservices are needed for the baseline.

## References

- [Better Auth bearer sessions](https://better-auth.com/docs/plugins/bearer)
- [Ably token auth and capabilities](https://ably.com/docs/auth/token)
- [Ably Flutter SDK](https://pub.dev/packages/ably_flutter)
- [Ably pricing](https://ably.com/pricing)
- [Supabase pricing](https://supabase.com/pricing)
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Vercel Hobby](https://vercel.com/docs/plans/hobby)
- [Firebase pricing](https://firebase.google.com/pricing) and [FCM](https://firebase.google.com/docs/cloud-messaging)

Pin tested versions and record native integration results before adopting these packages. Local encrypted-storage configuration is an implementation check, not a guarantee supplied by SQLite or `local_auth` alone.
