# Plan: Generic mobile notification platform and initial publishers

**Status:** Approved 2026-10-03.  
**Brief:** [brief.md](brief.md)  
**Specification:** [spec.md](spec.md)

**Approval:** User approved this plan, including the separate notification delivery domain, internal typed publishers, capability-gated rollout, and local-notification spike, during the AGaw planning session on 2026-10-03.

## Current constraints and entry points

- `apps/api/src/features/messaging/shared/append-conversation-change.ts` writes message-specific realtime and push jobs. Its `messaging_outbox` rows require a conversation and change sequence.
- `apps/api/src/infrastructure/jobs/{outbox-store,dispatch-outbox,messaging-delivery-runtime}.ts` provides leased, retried messaging delivery.
- `apps/api/src/infrastructure/push/{push-dispatcher,push-destination.repository,fcm}.ts` assumes a conversation target and builds a hard-coded new-message payload.
- `apps/api/src/features/relationships/send-friend-request/` writes a pending request inside a relationship-pair transaction but creates no notification work.
- `apps/api/src/features/posts/create-post/` and the posting-day services use `@dayli/domain` Auckland calendar calculations. `apps/api/src/index.ts` already has a one-minute cron for delivery repair.
- Flutter has `FirebasePushLifecycle`, `PushService`, `NotificationRouter`, `apps/mobile/lib/main.dart`, and `apps/mobile/lib/app/{app.dart,router.dart}`. It currently handles only `conversationId` and intentionally displays no foreground OS banner.
- `apps/mobile/lib/friends/friends_screen.dart` already renders incoming requests at `/friends`. The feed is `/` and the composer is `/post`.

## Proposed architecture

### Separate notification delivery domain

Do not generalize `messaging_outbox`. It has non-null messaging foreign keys and semantics, so widening it would couple unrelated features to conversation state and risk existing realtime delivery.

Add a notification-specific durable domain, for example:

- A logical notification-event/recipient table or scheduler ledger, with a unique key for the event category, recipient, and source or Auckland-day identity.
- A per-device notification delivery outbox with event ID, recipient, approved kind, opaque target type/ID, device registration, lease/status/backoff fields, and a uniqueness constraint that fences duplicate device work.

Store a typed kind and opaque target, not arbitrary title/body text, in durable event rows. At dispatch, trusted server code resolves the current authorized preview: direct messages use the current sender display name and message text, friend requests use sender display name and fixed wording, and daily events use fixed product copy. Do not persist plaintext preview text in the outbox. Keep the existing message outbox unchanged.

Extract only generic lease/claim mechanics where genuinely shared. Keep messaging-specific authorization and generic-notification authorization separate. The generic FCM handler should resolve an eligible device at dispatch and run a per-kind authorization recheck before sending.

### Publisher boundary

Create an internal notification publisher interface under an infrastructure-neutral shared location, accepted only through injected dependencies. It exposes typed calls for the four approved categories, not a generic `sendToUser` command.

- Message creation calls its typed publisher from the existing transaction after a new message is known, never on idempotent replay, edit, reaction, or read.
- Friend-request creation calls its typed publisher in the same request transaction only after the pending row is inserted.
- The scheduled daily publisher derives eligible recipients in bounded batches and records an idempotent logical event plus per-device work transactionally.

The message and friend-request publisher must not call FCM inside their source transaction. Immediate dispatch runs only after commit through `ExecutionContext.waitUntil`; scheduled repair handles failures.

### Dispatch rechecks

At delivery time, the resolver verifies current device registration, session, account status, the account-level global preference, device OS/registration eligibility, and notification-schema capability. The kind-specific check additionally verifies:

- message recipient still has the allowed conversation state and no block, and resolves the current message body and sender display name. An unsent message suppresses the delivery; an edit changes the preview;
- friend request is still pending for the recipient and no block exists, and resolves the sender display name;
- daily reminder recipient still has not posted for the relevant Auckland day;
- daily release recipient still has at least one visible released friend post.

Suppression is a successful terminal no-op. Permanent provider rejection invalidates the device token. Transient failures use the existing bounded backoff pattern.

### Daily scheduling

Extend the existing `scheduled` Worker path, not a client timer. A scheduled notification service uses `createAucklandDayService` and server time to identify the 23:00 final-hour and 00:00 release windows. It claims each logical recipient event with a unique database key before creating device work. It processes bounded batches and is safe if cron runs more than once or recovery occurs late.

The scheduling identity must use the intended Auckland date and event kind, including an unambiguous definition for midnight release. This avoids duplicate events during normal repeats, recovery, and daylight-saving transitions.

### Flutter presentation and routing

Add a platform local-notification adapter, likely `flutter_local_notifications`, behind a feature-neutral `NotificationPresenter` interface in `apps/mobile/lib/notifications/`.

1. Initialize the adapter before app composition and request platform notification permission through the existing push start path.
2. Decode a strict FCM data envelope with event kind and opaque target. Reject unknown/malformed payloads without navigation.
3. On foreground `onMessage`, refresh only the affected feature and display a local OS notification via the presenter.
4. On background/terminated receipt, rely on the FCM notification presentation and route the typed payload on tap.
5. Replace conversation-only `NotificationRouter` with a typed router that defers navigation until session restoration, then has the destination controller fetch current authorized state. Routes are `/messages/:id`, `/friends`, `/post`, and `/`.
6. Route local-banner taps through the same typed router.

Add an account-level global preference, defaulting off, plus an explicit mobile settings control. Apply it to legacy message jobs as well as new generic delivery. Keep per-device OS permission, valid token, and capability as separate delivery eligibility. Do not add per-category preferences or quiet-hours controls in this batch. Reuse #34 for the final-hour scheduler and add a separate release publisher, preserving quiet hours in a blocked follow-up.

## Data, migration, and deployment

- Add Drizzle schema entries, additive SQL migrations, migration review artifacts, metadata, indexes, and least-privilege grants for account notification preferences, logical events, and per-device deliveries. Add a notification-schema capability field to device registrations.
- Extend `ApiEnv`, local/staging configuration examples, and `apps/api/src/index.ts` only as needed for a notification feature flag and scheduled processing. Do not add secrets beyond existing FCM and encryption bindings.
- Retain `PUSH_TOKEN_ENCRYPTION_KEY` as a Cloudflare-only secret. Existing deployment scripts already protect it from routine synchronization.
- Deploy schema first, compatible API/cron code second with publishers disabled, then release a mobile build that registers its schema capability. Enable generic delivery only for capable devices, ensuring legacy and generic message delivery are mutually exclusive. Enable publishers after staging validation. #141 remains the external configuration prerequisite; #130 and #131 remain validation/release gates.

## Alternatives and trade-offs

- **Separate notification outbox, selected:** preserves the stable messaging outbox's required conversation/change model. It adds a small delivery subsystem but avoids a risky cross-domain schema rewrite.
- **Widen messaging_outbox, rejected:** would require nullable messaging foreign keys and condition-heavy dispatch rules, increasing regression risk in realtime delivery.
- **Device-local daily scheduling, rejected:** device clocks, app termination, and timezone changes cannot enforce eligible-recipient policy or durable deduplication.
- **Public arbitrary-send endpoint, rejected:** it would bypass per-event authorization and create a notification abuse surface.

## Test strategy

- API unit tests for typed publisher allowlist, no-op on replay, payload redaction, stale event suppression, and immediate post-commit dispatch.
- PostgreSQL integration tests for transaction rollback, uniqueness/deduplication, current-session/device checks, friend request cancellation/block race, daily eligibility, timezone/DST, and concurrent scheduler claims.
- Worker scheduled-handler tests for bounded batches and recovery.
- FCM adapter tests for typed payload shape, current message preview and sender-name retrieval, fixed daily copy, token invalidation, retry categories, and log redaction.
- Flutter unit/widget tests with fake Firebase and presenter for foreground banner, denial, local/remote taps, session restoration, stale target, logout, and account replacement.
- Physical Android/iOS staging checks only after #141.
- Run `pnpm --filter @dayli/api test`, `pnpm --filter @dayli/api test:realtime`, `pnpm db:check`, `pnpm db:test`, `pnpm generate:clients`, `pnpm generate:clients:check`, `pnpm lint`, `pnpm typecheck`, and `(cd apps/mobile && flutter analyze && flutter test)`.

## Risks and spike

The largest risks are lock-screen preview privacy and FCM platform presentation differences, particularly the interaction between foreground local banners and background FCM notification payloads. Before broad implementation, make a small platform spike that validates the chosen local-notification package with the repository's pinned Flutter/Firebase versions on Android and iOS, including local-banner tap callbacks. It must not claim physical-device release evidence, which remains #130.
