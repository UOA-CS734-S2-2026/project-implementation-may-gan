# Dayli messaging implementation handoff

Status: implementation handoff and stack record. The approved order is refactor at `cd00116`, friends UI at `79bcceb`, then messaging rebased on friends. Approved web and Flutter messaging flows are integrated, including mobile old-session revocation and quarantine before credential replacement. REST clients are regenerated from the merged Hono app. The web uses session-scoped TanStack Query messaging hooks.

Follow the [backend architecture](../backend-architecture.md) for action slices, action-prefixed filenames, optional layers, shared transactions, and typed session middleware. The three stack layers share reviewed interfaces: refactor first, friends second, messaging third. Immutable media validation owns `0009_add_media_reservation_validation`; friends owns `0010_relationship_search`; messaging follows with undeployed `0011_messaging_foundation` and `0012_encrypt_push_device_tokens`. Do not modify deployed migration history. Freeze auth, registration, locking, and test interfaces before adding work from independently reviewed client branches.

## Goal and scope

Build Instagram-style text direct messaging on web and Flutter, with live foreground delivery rather than periodic polling. Teach and preserve the separation between durable data, event delivery, client synchronization, and background push.

Confirmed requirements:

- Both Next.js and Flutter use the same authenticated Hono REST API.
- One-to-one conversations, inbox, message requests, paginated history, unread badges, read receipts, replies, reactions, edits, and unsending.
- Friends can start chats immediately. Non-friends get one initial message until the recipient accepts.
- Edit your own text within 15 minutes of server creation time. Unsend your own message anytime, subject to the block rules below. Show an Edited marker and retain an unsent tombstone without its body.
- WebSockets carry small change notifications. Clients fetch authorized state through REST. Do not put message bodies on sockets in this release.
- Persist an outbox in the message transaction. Attempt dispatch immediately after commit; scheduled processing only repairs failures and handles retries.
- No periodic client polling, including a fallback polling loop. Initial load, user refresh, foreground resume, reconnect, and socket events can trigger REST fetches.
- Mobile push is in scope. Registration and dispatch recheck current sessions and account status, but FCM/APNs configuration and physical-device proof remain release gates for background notifications. No provider or device-delivery evidence is represented by local tests.
- Image and video attachments are blocked on the other owner's R2 upload integration. Do not implement a parallel uploader or accept arbitrary media URLs.
- Group chats are deferred pending an explicit group blocking/membership policy. Do not silently include them in the direct-chat implementation.

This is not end-to-end encrypted messaging. TLS and provider encryption at rest do not mean E2EE. Presence, typing, delivered-to-device receipts, browser Web Push, search within message bodies, notification preferences beyond a global mobile-push opt-in, and offline message persistence are outside this release. A broader feature selection did not establish specific typing/presence behavior.

## Current codebase and constraints

| Existing path | Relevant behavior |
| --- | --- |
| `apps/api/src/app.ts` | `createApp` injects test dependencies and registers OpenAPI routes. `createAppForEnv` wires auth, Hyperdrive, and feature services. Default app must remain DB-free so contract generation works. |
| `apps/api/src/index.ts` | Worker entry exports the messaging Durable Object and scheduled dispatcher. |
| `apps/api/src/env.ts` | Worker binding types include messaging delivery, realtime, and protected push configuration. |
| `apps/api/src/features/relationships/{contract,route,service,postgres-store}.ts` | Concrete vertical-slice pattern to follow. Route adapters validate/authenticate, services enforce policy, stores own transactions. |
| `apps/api/src/features/relationships/postgres-store.ts` | Pair lock uses sorted, length-prefixed IDs and `pg_advisory_xact_lock(hashtextextended(pairKey, 734))`. Messaging must share this exact lock identity. |
| `apps/api/src/features/permissions/` | Existing permission helpers. History access still needs messaging membership checks. |
| `apps/api/src/features/auth/better-auth.ts`, `apps/api/src/lib/session.ts` | Better Auth identity, secure browser cookies, native bearer sessions. Socket auth additionally needs session ID and expiry, not only user ID. |
| `apps/api/src/lib/hyperdrive.ts`, `packages/db/src/index.ts` | Invocation-scoped postgres.js/Drizzle clients, disposal, transactions. Hyperdrive cache must remain disabled. |
| `packages/db/src/schema/{index,messaging,relationships,users}.ts` | Messaging and relationship schema exports support the stacked migrations. |
| `packages/db/migrations/` | Additive controlled migrations. This stack orders immutable media validation `0009_add_media_reservation_validation`, friends `0010_relationship_search`, messaging `0011_messaging_foundation`, then encrypted push tokens in `0012_encrypt_push_device_tokens`. |
| `packages/contracts/src/common/` | Shared IDs, timestamps, errors, pagination. Feature contracts currently live beside Hono routes, not in a central feature-contract directory. |
| `scripts/generate-openapi.ts` | Uses registered Hono routes to produce `packages/contracts/openapi.json`. |
| `packages/api-client-typescript/`, `packages/api-client-dart/` | Generated REST clients. Never hand-edit generated models. Dart currently uses the generated HTTP client, not Dio. |
| `apps/web/features/messaging/`, `apps/web/lib/session/` | Action-scoped TanStack Query hooks, session-scoped cache boundaries, realtime reconciliation, and generated-client adapters. |
| `apps/web/app/(main)/messages/page.tsx` | Messaging inbox route backed by the feature hooks. |
| `apps/mobile/lib/app/{app_scope,router}.dart`, `apps/mobile/lib/auth/session_controller.dart` | Existing dependency injection, navigation, and session lifecycle. Flutter currently uses controllers, not Riverpod. |
| `apps/mobile/lib/placeholders/placeholder_screens.dart` | Messaging placeholder. Preserve unrelated placeholder screens. |
| `apps/api/vitest.postgres.config.ts`, `apps/api/vitest.config.ts` | Real-Postgres and ordinary API test entry points. |

Messaging tables, REST endpoints, outbox dispatch, ticketed socket invalidations, protected push registration, and web and mobile flows are integrated. Historical SSE/tRPC messaging was not imported. Local verification does not replace Firebase/APNs configuration, physical-device delivery evidence, or staging validation.

## Merge readiness and deployment handoff

The Worker fetch entrypoint now forwards the Cloudflare execution context into Hono, so successful message writes retain their bounded `waitUntil` dispatch. The staging generator includes the `USER_REALTIME` binding, SQLite migration, and retry cron. The probe Worker has no scheduler or shared Durable Object binding. Staging auth, email, and optional FCM secret synchronization is part of the approved manual deployment. `PUSH_TOKEN_ENCRYPTION_KEY` stays Cloudflare-only and outside routine sync.

Local evidence on this branch includes the API Worker test suite and typecheck, Node tests for staging origins, auth bindings, generated configuration, and mocked secret synchronization, plus Wrangler dry runs for synthetic staging API and probe configurations. No hosted workflow, remote deployment, Cloudflare write, or real credential use occurred. `actionlint` was unavailable locally.

The remaining external gate is an owner-configured and approved GitHub `staging` Environment, an existing exact staging Worker and Hyperdrive resource, reviewed staging source secrets, PostgreSQL migration readiness, and physical-device Firebase/APNs proof. See [staging deployment](staging-deployment.md) for the owner procedure and encryption-key recovery rules.

## Architecture in plain terms

```text
Alice web or Flutter
  -> authenticated POST message
  -> Hono route -> messaging service -> Postgres transaction
       pair permission lock -> conversation lock -> message + change + outbox rows
  <- canonical saved message, reconcile optimistic bubble

After commit
  -> bounded immediate outbox dispatch
  -> each affected participant's UserRealtime Durable Object, including the actor
  -> all valid connected sessions receive a change notification
  -> client fetches authorized changes/inbox over REST
  -> React query cache or Flutter controller renders saved state

When mobile is suspended
  -> independent push delivery job -> FCM HTTP v1 -> Android or APNs -> iOS
  -> user taps -> authenticate -> fetch conversation using REST

If dispatch fails
  -> scheduled handler reclaims due outbox work -> retry with lease and backoff
If a connection fails
  -> reconnect with a fresh ticket -> reconcile from durable REST state
```

The outbox guarantees durable dispatch intent, not exactly-once device delivery. A successful socket publish is not a read receipt. PostgreSQL is the source of truth. Durable Object SQLite holds socket coordination metadata, not message history.

### Alternatives and cost decision

Hibernating WebSockets fit the existing Worker deployment and avoid repeated empty polling requests. SSE could provide one-way notifications but should not be assumed to have equivalent hibernation economics. Long polling still holds requests and reconnects. A dedicated Node WebSocket service plus a broker is viable at sustained load but introduces another deployment and operational owner. Managed realtime can replace the publisher adapter later if maintenance cost outweighs provider charges. MQTT adds a broker without a clear Dayli benefit. Database-sync subscriptions require a broader authorization/sync design and are not necessary for reactive client state.

No new queue or Redis service initially. Preserve publisher and push interfaces so transports can change without rewriting storage. Measure connected devices, event rate, fan-out, REST refreshes, SQL time, active object duration, reconnect bursts, and oldest outbox age. Do not promise a free tier or use registered-user counts as a cost estimate. Coalesce event bursts into one fetch and cap connections. The current healthy foreground target is change visible within two seconds p95 in measured staging, not a guarantee of zero latency. Measure commit-to-render separately from scheduled outage recovery and OS push delivery.

## Product rules and explicit assumptions

The following defaults make the plan executable. They are proposed engineering/product defaults, not previously agreed team decisions. Confirm them in the contract/policy ticket before dependent implementation.

- Text is plain text, 1 through 4,000 Unicode code points after rejecting whitespace-only input; no HTML. Preserve meaningful whitespace. Test client/server Unicode length agreement.
- A direct conversation is unique for an unordered user pair. No self-chat. Both participants are fixed.
- Creating a direct chat includes its first message. Avoid empty conversation spam. Existing direct pairs route to the same thread.
- States are `pending`, `active`, and `declined`. Only the pending recipient accepts/declines. Pending initiator has exactly one message total, including retries or unsent tombstones. No reactions, edits, replies, or shared read receipts while pending. Sender may unsend the initial message but does not regain quota. Declined requests cannot be reopened by the sender. A recipient may later accept, or an active friendship may activate the thread under the pair lock on the next authorized mutation. Inbox queries must make that state transition explicit rather than imply a reset request quota.
- Accepted conversations stay active if friendship ends, unless blocked. No automatic request reset. Request decline is not a block.
- Pending requests live in a separate inbox; their unread count is separate. Fetching a request may update a private read cursor but does not disclose a receipt until acceptance. Acceptance captures the current private read state and emits the authorized snapshot.
- One reaction per actor per message, selected from a small documented allowlist. Set replaces your reaction; delete removes it. Suggested initial keys: `like`, `love`, `laugh`, `surprised`, `sad`, `thanks`. Do not use arbitrary unbounded emoji strings as database keys.
- Replies reference a message in the same conversation. Render a projection of the current parent body. Never persist a copied quote that would outlive unsending. A parent outside the loaded page comes from an authorized reply preview in the message response.
- Edit window uses server time inside the write transaction; exact cutoff is `now < createdAt + 15 minutes`. Concurrent edits require an expected message version. No public edit history for messages; posts' immutable revision policy is separate.
- Unsend clears stored body, sets `unsentAt`, removes reactions, and bumps version. Message ID/sequence/sender metadata remain for stable ordering. Clear cached text, reply previews, inbox previews, and pending payloads. Backups follow the existing expiry policy. A previously viewed message or delivered OS alert cannot be recalled.
- **Confirmed 2026-09-28:** Blocking in either direction prevents all new peer-visible activity, including edit, unsend, reactions, acceptance, and shared read receipts. Existing history remains readable. Private mark-read for clearing your own badge is allowed but publishes no receipt while blocked. Explain disabled actions in UI without identifying who blocked whom. Neither participant can resume these actions until unblocked.
- Push defaults to a generic `New message on Dayli`, without sender name, text, reaction, or reply previews. Push on new messages/initial requests only, not every edit/reaction/read. Queue to opted-in recipient devices regardless of socket presence; a live connection does not prove attention. The Flutter foreground handler avoids a second OS banner and refreshes state.
- Existing user selection/search is incomplete. V1 supports starting a conversation from a known profile/user ID. Do not add a directory that exposes private accounts. A searchable people picker needs an existing authorized lookup or a separately reviewed discovery ticket.

Open release dependencies: Firebase project ownership and environment separation, APNs key/team/bundle configuration, Android app identifiers, mobile signing, exact API/browser origins, and staging Cloudflare binding ownership. Do not put credentials or resource IDs into the plan or issue bodies.

## Proposed database design

Use `TIMESTAMPTZ` for timestamps, opaque existing-style IDs, and foreign keys to the existing user table. Encode sequence/version values as decimal strings in JSON if using PostgreSQL bigint; avoid silent JS integer precision loss. Choose and test a single contract representation.

| Table | Core columns and constraints |
| --- | --- |
| `conversations` | `id`, `kind=direct`, canonical `user_low_id`, `user_high_id`, `initiator_id`, `request_state`, `last_message_sequence`, `last_change_sequence`, `last_activity_at`, timestamps. Unique canonical pair, check unequal participants. |
| `conversation_members` | `(conversation_id,user_id)` primary key, `last_read_sequence`, `receipt_sequence`, timestamps. Exactly the two direct participants, enforced by store transactions plus migration constraints/trigger or a schema representation that makes extras impossible. `receipt_sequence` is monotonic, never advanced by blocked/private-only reads. |
| `messages` | `id`, `conversation_id`, `sequence`, `sender_id`, `client_message_id`, `request_fingerprint`, nullable `body`, nullable `reply_to_message_id`, `version`, `created_at`, `edited_at`, `unsent_at`. Unique `(conversation_id,sequence)` and `(sender_id,client_message_id)`. Composite membership FK and same-conversation reply FK. Body may be null only when unsent. |
| `message_reactions` | `(message_id,user_id)` primary key, reaction key, timestamp. Enforce participant membership in transaction; reject tombstoned targets. |
| `conversation_changes` | `(conversation_id,change_sequence)` primary key, change kind, target message/member ID, timestamp. No message bodies. Retain for the first release; bound reads. Enables recovery of edits, reactions, unsending, and reads outside the currently loaded history page. |
| `messaging_outbox` | `id`, immutable `event_id`, `recipient_id`, `conversation_id`, `change_sequence`, `channel`, nullable `device_registration_id`, `status`, `attempts`, `available_at`, `lease_token`, `lease_expires_at`, sanitized failure category, timestamps. Unique logical event/recipient/channel/destination. No message body. |
| `socket_tickets` | `token_hash` unique, `user_id`, `session_id`, ticket expiry, session expiry, consumed timestamp. Store only hash; atomic single-use claim. Cleanup expired rows in bounded scheduled batches. |
| `push_devices` | `id`, `user_id`, `session_id`, `installation_id`, `platform`, encrypted/restricted FCM token, token hash unique, opt-in state, last registration and invalidation timestamps. Global token uniqueness prevents duplicate owners. |

Indexes: membership by user/conversation; conversation activity plus ID for inbox; messages by conversation/sequence; recipient and sender retry lookup; changes by conversation/change sequence; due outbox status/available time and expired leases; devices by user/enabled; ticket expiry and session lookup. Review query plans against realistic history, not only empty tables.

Do not derive unread counts as `lastSequence - lastReadSequence`: that includes your own messages and unsent entries. Count unread non-tombstoned messages from the other participant using indexed predicates, or maintain tested counters transactionally. Return separate active/request totals.

### Transaction and concurrency rules

1. Take the existing unordered relationship-pair advisory transaction lock first. Extract its exact encoding/seed into a shared DB helper and have both relationship mutations and messaging use it.
2. Resolve current account status, membership, blocks, friendship, and request state under that lock. Then lock the conversation row. All relevant writers follow pair then conversation ordering.
3. For a retry, compare a canonical fingerprint including conversation/recipient, text, and reply target. Identical requests return the same message identity without a second event; conflicting key reuse returns 409. Reauthorize retries. After edits/unsending, return the current safe representation rather than resurrecting the original body. Store a fingerprint, not an additional immutable plaintext payload.
4. Increment the conversation message sequence for a new message only. Increment the shared change sequence for any persisted peer-visible change. Insert corresponding change records and delivery work in the same transaction. Realtime invalidations target every affected participant user, including the actor, so their other tabs/devices reconcile sends, edits, unsending, reactions, and reads. Private-only state changes notify only that user's sessions and do not expose a shared change position. Push targets eligible peer devices only, never the actor's devices. A changed row and its outbox record must never commit separately.
5. Read cursor is clamped to a real authorized conversation position and updated using monotonic max semantics. Shared receipt cursor advances only when interaction is permitted.
6. Commit before calling external services. Outbox dispatch creates and disposes its own database client; never pass a request-scoped client into a delayed `waitUntil` callback after disposal.
7. Dispatch rechecks current session/device/membership/block policy. Suppress obsolete peer interaction after block or account deletion; historical REST access follows the existing history policy. A generic self invalidation can refresh disabled actions. Explicitly test block racing with send and dispatch. Events already delivered before a block cannot be recalled.

Account deletion requires extending the existing deletion/cleanup design to these tables and subscriptions. Immediately deny API/socket/push access for deleted accounts and remove active bodies in the controlled cleanup. Do not claim account deletion works until the actual auth/deletion lifecycle is verified.

## Hono API contract

All paths below are relative to `/api/v1`. Use `OpenAPIHono`, feature-local Zod schemas, `createRoute`, stable operation IDs, and shared error envelopes. Actor always comes from Better Auth. Every private response uses `Cache-Control: no-store`. Browser mutations retain trusted-origin/CSRF protection; sockets require their own origin validation.

Common errors: 401 unauthenticated; 404 for invisible resources/nonmembership; 403 for a visible thread's forbidden action without disclosing block direction; 409 for state/version/idempotency conflict; 422 for schema/cursor errors; 429 with retry guidance for rate limits; 503 for missing infrastructure. No SQL, provider response bodies, or tokens in errors.

| Method and path | operationId | Request | Response and behavior |
| --- | --- | --- | --- |
| `POST /conversations/direct` | `createDirectConversation` | `{recipientId, clientMessageId, text}` | 201 for newly created message, 200 identical retry. `{conversation,message}`. Pair uniqueness also handles simultaneous opposite-direction creation. Existing active pair accepts another distinct message; existing pending pair preserves one-message rule. |
| `GET /conversations` | `listConversations` | `folder=inbox|requests`, opaque cursor, limit default 30/max 100 | `{items,nextCursor}` with peer-safe display projection, state, capabilities, latest safe preview, unread count, last message/change/read positions. Stable activity/ID keyset pagination; dedupe and refresh first page when activity moves. |
| `GET /messaging/unread` | `getMessagingUnread` | none | `{inboxCount,requestCount}`. Counts unread messages, not conversations. |
| `GET /conversations/{id}` | `getConversation` | ID | Current conversation state/membership/capabilities and positions. |
| `PUT /conversations/{id}/request` | `resolveMessageRequest` | `{decision: accept|decline}` | Updated conversation. Same decision retries are idempotent; only recipient authorized; defined allowed state transitions. |
| `GET /conversations/{id}/messages` | `listMessages` | exclusive `beforeSequence` or `afterSequence`, limit default 50/max 100 | `{items,nextCursor,hasMore}`. Latest page if neither; display ascending sequence. Cursor must be bound to conversation/direction. After-page supports catch-up but does not replace change synchronization. |
| `POST /conversations/{id}/messages` | `sendMessage` | `{clientMessageId,text,replyToMessageId?}` | 201 saved or 200 identical retry. Canonical message. |
| `GET /conversations/{id}/messages/{messageId}` | `getMessage` | IDs | Current canonical message, including tombstone, reactions, safe reply preview, version. Useful for older changed messages. |
| `PATCH /conversations/{id}/messages/{messageId}` | `editMessage` | `{text,expectedVersion}` | Updated message; sender only within edit window. Identical retry whose expected version is stale returns 409; client fetches current version and treats matching text as reconciled, never blindly retries a newer edit. |
| `DELETE /conversations/{id}/messages/{messageId}` | `unsendMessage` | IDs | 200 tombstone. Idempotent on an already-unsent message; no physical row deletion. |
| `PUT /conversations/{id}/messages/{messageId}/reaction` | `setMessageReaction` | `{reaction}` | Current reaction summary and message version; own reaction only. No-op retries create no new event. |
| `DELETE /conversations/{id}/messages/{messageId}/reaction` | `removeMessageReaction` | IDs | Current reaction summary/version; idempotent. |
| `PUT /conversations/{id}/read` | `markConversationRead` | `{throughSequence}` | `{lastReadSequence,receiptSequence,unreadCount}`; private versus shared policy enforced server-side. |
| `GET /conversations/{id}/changes` | `listConversationChanges` | `afterChangeSequence`, limit default 100/max 200 | Ordered bounded change references and `nextChangeSequence`, `hasMore`, current high-watermark. Authorized current message/state projections can accompany references to avoid N+1 requests. Capture a bounded watermark and drain pages, then repeat if events indicate later work. |
| `POST /realtime/tickets` | `createRealtimeTicket` | empty object | 201 `{ticket,expiresAt,webSocketUrl}`. 60-second proposed ticket TTL, no longer than session lifetime. Never put reusable session tokens in this URL. |
| `GET /realtime/connect` | documented protocol upgrade | `ticket` query parameter, Upgrade headers | 101 WebSocket after atomic consumption/session/origin checks. Handwritten transport, not a generated REST operation pretending to return JSON. |
| `PUT /push/devices/{installationId}` | `registerPushDevice` | `{token,platform: ios|android,optedIn}` | Current registration without echoing token. Authenticate owner, rotate token and invalidate prior binding. |
| `DELETE /push/devices/{installationId}` | `unregisterPushDevice` | ID | 204, only own registration; idempotent. |

Change references and projections follow the same current authorization and receipt-disclosure rules as ordinary REST reads. Private-only cursor changes must not leak through a peer's change feed; omit them from the shared change sequence or return only an authorized generic invalidation without the private value. History readability after a block does not authorize new shared receipt data.

Message DTO: ID, conversation ID, sequence, sender ID, clientMessageId, text or null, timestamps, version, unsentAt, reply target and safe preview, reaction summary. Do not expose internal fingerprints or outbox data. Define a limited peer display shape for existing blocked history rather than returning private profiles.

Add a small typed event contract in `packages/contracts/src/realtime.ts`, exported by `src/index.ts`. REST schemas remain next to routes. Example event:

```json
{"version":1,"eventId":"opaque-event-id","type":"conversation.changed","conversationId":"opaque-conversation-id","changeSequence":"43"}
```

The socket also needs a `ready` control event after registration; clients buffer events before processing it. `session.revoked` is optional advisory; a close code must trigger logout/reauthentication appropriately. Treat unknown event versions as requiring safe resynchronization, not a crash. Flutter needs a small handwritten validated decoder because REST OpenAPI generation does not generate a socket listener.

Illustrative Hono composition, not implementation code:

```ts
registerMessagingRoutes(api, messagingDependencies);
registerRealtimeRoutes(api, realtimeDependencies);
registerPushRoutes(api, pushDependencies);
```

Attach injected typed `requireSession` middleware to each protected OpenAPI route. Security metadata alone does not enforce auth. Services receive actor/session context, stores, clock, and publisher interfaces, not Hono contexts. Route adapters translate typed domain errors, set no-store, and schedule bounded post-commit work. Resource authorization and mutable permission checks remain in the action transaction, not only middleware. No generic RBAC layer is needed for direct-message membership/ownership. `createApp()` without runtime bindings still exposes REST contracts with unavailable dependencies.

## Realtime, session security, and recovery

- One `USER_REALTIME` Durable Object per verified user via `idFromName(userId)`. Multiple tabs/devices share that user's object, not a global singleton. The publisher targets both actor and peer for shared changes; `recipient_id` in the outbox means event delivery audience, not necessarily the recipient of a chat message. Actor invalidations synchronize other devices and are safe to receive on the originating device because reconciliation deduplicates the REST result. Private-only changes target the actor alone. Push has a separate peer-only audience.
- Define `UserRealtime` in `apps/api/src/infrastructure/realtime/user-realtime.ts`, export it from `apps/api/src/index.ts`, and bind it in API Wrangler configs. Internal RPC publishes events and revokes sessions. No public endpoint accepts an arbitrary user ID/event for publication.
- Ticket upgrade atomically updates unused, unexpired ticket state, verifies the underlying session remains valid, and forwards verified identity internally. Native upgrades may lack Origin; allow that only with a valid issued ticket. Browser Origin must exactly match configured trusted origins. Strip client-supplied internal identity headers.
- Redact the ticket query parameter in application and infrastructure logs. Disable recording upgrade URLs if redaction cannot be proven. Store ticket hashes only.
- Use `acceptWebSocket`/hibernation APIs and serialized attachments containing session ID, expiry, user identity, and protocol version. Recover all connection metadata after eviction.
- Persist the next expiry alarm, close expired sockets on alarm, and schedule the next remaining deadline. An ordinary timer is not sufficient. Revalidate sessions before sensitive publication with fresh DB reads and close invalid sessions. Wire Better Auth logout/revocation to internal socket closure; expiry alone is not immediate revocation.
- Serialize upgrade/revocation handling per user and test a revoke racing with ticket consumption/socket registration. A socket that survives the race must still receive no subsequent event after fresh session validation. No application data frame can publish a peer event.
- Suggested initial limits: five concurrent sockets per user, bounded ticket issuance, 4 KiB maximum inbound frame, no client data frames except documented connection control. Expose limits in config with tests; tune against multiple tabs and native reconnects. Do not invent typing frames in this release.
- Outbox dispatcher uses `FOR UPDATE SKIP LOCKED` to claim bounded work and commits its lease before external calls. A random lease token fences completion updates. Reclaim expired leases, use exponential backoff/jitter, cap attempts, and expose failed counts without message content. Real-time and each push device have independent delivery records so a push outage cannot block sockets.
- Immediate dispatch uses a bounded budget after commit through `waitUntil`; scheduled cron retries due work. An outbox entry acknowledged by a DO is not proof a client fetched it. Clients must reconcile after interruption.
- Mount one messaging connection coordinator per authenticated client instance, not per conversation component. Keep unread/inbox invalidation active on other foreground screens. Avoid a socket per query or per thread.
- On initial connection/reconnect, register handlers and buffer events, wait for ready, refresh inbox/unread/conversation, then drain changes after the last successful change cursor. Advance cursor only after applying a page. Merge by message ID/version and monotonic read/change positions. Continue if buffered events indicate a newer watermark.
- Handle unsending/reactions/edits outside the latest page with change references and cache invalidation. Never assume new-message sequence alone represents all updates. On a fresh process with no cache, latest state and history are enough; keep cursors tied to the corresponding cache, not persisted independently from lost data.
- Backoff reconnect attempts with jitter and a cap; request a new ticket each time. Show `Reconnecting`/`Updates paused`, keep manual refresh available, and resume on connectivity/foreground events. No periodic REST fallback.
- REST sending may remain available while the socket is down. Optimistic pending/failed bubbles retain their retry IDs in memory. Do not promise sends survive app termination in this release. Clear all private caches and close sockets on logout/account switch.

## Mobile push delivery

Use FCM HTTP v1 for Android and iOS; Firebase routes iOS through APNs after Apple configuration. Do not build a second direct APNs sender initially. Flutter adds `firebase_core` and `firebase_messaging`, permission handling, token refresh, foreground handling, background entrypoint, and notification tap routing.

The Worker uses standard `fetch` plus Web Crypto or a Worker-compatible JWT library to mint short-lived Google service-account OAuth tokens. `jose` is currently a dev dependency in `apps/api`; move it to runtime dependencies only if production signing imports it. Do not import the Node Firebase Admin SDK without a proven Worker compatibility need.

- Store credentials using approved Worker secrets, never wrangler plaintext or GitHub issue bodies. Separate Firebase staging/production projects or explicitly isolated apps/configuration.
- Registration binds the FCM token to the authenticated installation/session. Re-registration atomically removes another owner for the same token. Never send Alice's push to a device after Bob signs in on it.
- Logout unregisters before session teardown when possible; server dispatch also verifies live session/account/registration, so failed client cleanup cannot leak later notifications.
- Dispatch checks current message existence/tombstone, block policy, device opt-in, and read state to suppress stale alerts where possible. Invalidate tokens on permanent provider rejection; retry transient rate limits/unavailability with bounded backoff. Deduplicate/collapse by conversation when appropriate, without promising exactly-once banners.
- Payload contains a generic title/body, event ID and conversation ID only. Tap targets are untrusted navigation input: authenticate and authorize REST fetch before showing history. If cold-started/logged out, defer navigation until session resolution.
- App-open push must not duplicate a message or socket-driven banner. Test token rotation, background/terminated launch, permissions denied, logout, and account switching on iOS and Android physical devices.
- Foreground text messaging can be enabled before push readiness. Do not advertise background notifications as delivered until FCM/APNs evidence passes. Browser push is deferred.

## Proposed file tree and package placement

`[new]` means planned, not checked-in. Each action uses `<action>.contract.ts`, `<action>.route.ts`, and meaningful optional `<action>.service.ts` / `<action>.repository.ts`, with named colocated tests. Do not recreate a monolithic messaging service/store or mandatory pass-through layers. Accept and decline are separate action services behind the currently proposed single request-decision endpoint; its thin adapter dispatches by validated decision without changing the public API.

```text
apps/api/
  package.json                         [modify] Runtime signing dependency only if used; existing Cloudflare tooling stays here
  wrangler.jsonc                       [modify] USER_REALTIME binding, SQLite DO migration, retry cron
  wrangler.local.example.jsonc         [modify] Local binding example, no real credentials
  wrangler.staging.example.jsonc       [modify] Isolated staging binding/trigger example
  vitest.realtime.config.ts            [new] Worker/DO runtime tests, separate from plain service tests
  src/
    index.ts                           [modify] fetch, scheduled dispatch, named UserRealtime export
    env.ts                             [modify] DO namespace, push config, feature flags
    app.ts                             [modify] Register routes and inject feature dependencies
    http/
      middleware/require-session.ts    [reuse refactor] Typed injected auth middleware
      authenticated-actor.ts           [new or reuse refactor] Verified actor/session projection
    features/
      messaging/
        messaging.routes.ts            [new] Thin registration of action routes
        messages/
          send-message/
            send-message.contract.ts   [new] REST schema and documented responses
            send-message.route.ts      [new] Protected Hono adapter
            send-message.service.ts    [new] Operation orchestration
            send-message.repository.ts [new] Transactional persistence
            send-message.route.test.ts [new] HTTP and auth behavior
            send-message.service.test.ts [new] Policy/orchestration behavior
            send-message.repository.integration.test.ts [new] Real SQL/race checks
          list-messages/               [new] Bounded authorized history query
          get-message/                 [new] Canonical message and safe reply preview
          edit-message/                [new] Author, deadline and version checks
          unsend-message/              [new] Body removal and tombstone
          set-reaction/                [new] Set/replace own reaction
          remove-reaction/             [new] Idempotent own-reaction removal
        conversations/
          create-direct-conversation/  [new] Pair uniqueness and first message transaction
          list-conversations/          [new] Inbox/request queries
          get-conversation/            [new] State, membership and capabilities
          accept-message-request/      [new] Recipient acceptance operation
          decline-message-request/     [new] Recipient decline operation
          resolve-message-request/     [new] Thin decision-endpoint contract/adapter only
          mark-read/                   [new] Monotonic private/shared read state
          list-changes/                [new] Durable authorized change recovery
          get-unread-counts/           [new] Incoming-only inbox/request totals
        realtime/
          issue-ticket/                [new] Authenticated hash/expiry/issuance
          connect/                     [new] Atomic consume, session/origin checks and upgrade
        push/
          register-device/             [new] Owner/session-bound token rotation
          unregister-device/           [new] Idempotent installation removal
        shared/
          conversation-access.ts       [new] Common membership/block/request rules
          conversation-transaction.ts  [new] Pair then conversation locking discipline
          insert-message.ts            [new] Caller-owned transaction, no nested commit
          append-conversation-change.ts [new] Change and audience-specific outbox writes
          message-projection.ts        [new] Safe DTOs, reply previews and tombstones
    infrastructure/
      realtime/
        user-realtime.ts               [new] DO sockets, attachments, alarms, revocation
        publisher.ts                   [new] Internal transport adapter
        user-realtime.test.ts          [new] Worker-runtime lifecycle tests
      jobs/
        outbox-store.ts                [new] Claims, leases, fenced outcomes and retries
        dispatch-outbox.ts             [new] Immediate/scheduled channel dispatch
        dispatch-outbox.test.ts        [new] Duplicate and failure recovery
      push/
        fcm.ts                         [new] Worker OAuth and FCM HTTP adapter
        fcm.test.ts                    [new] Safe provider response/error tests
      auth/                            [reuse/refactor] Verified session runtime adapter
    features/auth/                    [modify targeted hooks] Logout/revocation integration
    features/relationships/           [modify targeted writes] Shared pair lock and invalidation on block
packages/
  db/
    src/schema/messaging.ts           [new] Conversations, members, messages, reactions, changes
    src/schema/messaging-delivery.ts  [new] Outbox, tickets, devices
    src/schema/index.ts               [modify] Export schemas
    src/relationship-pair-lock.ts      [new] Existing lock encoding extracted without behavioral change
    src/index.ts                      [modify] Export shared lock helper
    migrations/                       [new additive SQL/meta/review files] Constraints, indexes, grants
    src/messaging.integration.test.ts [new] Schema invariants and least-privilege access
  contracts/
    src/realtime.ts                   [new] Small versioned socket event types/schema
    src/index.ts                      [modify] Event exports
    openapi.json                      [generated] New REST operations
  api-client-typescript/              [regenerate] Hono REST client/models
  api-client-dart/                    [regenerate] Hono REST client/models
apps/web/
  package.json                       [modify] TanStack Query, component tests/browser QA tooling
  app/(main)/layout.tsx               [modify] Mount session-scoped messaging provider for all signed-in screens
  app/(main)/messages/page.tsx        [replace placeholder] Inbox/thread container
  app/(main)/messages/[id]/page.tsx   [new] Deep-linkable conversation
  components/providers/QueryProvider.tsx [new] Stable QueryClient for one mounted private account scope
  features/messaging/
    shared/{messaging.api,messaging.keys,query-result,message-cache,MessageBubble}.ts[x]
                                        Generated-client Result adapter, user-scoped keys, cache reconciliation, shared view
    inbox/{Inbox,use-inbox-query}.tsx   Inbox and request pagination
    conversation/{Conversation,use-conversation-query}.tsx
                                        Thread view and conversation projection
    message-history/use-message-history-query.ts
    {send-message,edit-message,unsend-message,set-reaction,remove-reaction,mark-read,create-conversation,resolve-request}/
                                        One action-owned TanStack mutation hook per command
    realtime/{MessagingProvider,MessagingRealtime}.ts[x]
                                        One foreground socket and durable change reconciliation
  lib/api/config.ts                    [existing] Browser API base URL configuration
  lib/messaging/{client-id,reconcile}.ts [existing] ID generation and pure versioned merge helpers
  components/ui/layout/Navbar.tsx    [modify] Unread count
  lib/session/provider.tsx           [modify or integrate] Clear cache/socket on session changes
  tests/messaging/                   [new] Controller/component and two-user browser scenarios
apps/mobile/
  pubspec.yaml                       [modify] websocket adapter if needed, Firebase packages
  lib/messaging/
    messaging_client.dart            [new] Generated REST client adapter
    messaging_controller.dart        [new] Inbox/thread state, sends, reads, actions
    realtime_client.dart             [new] Socket ticket/connection lifecycle
    realtime_event.dart              [new] Validated event decoder matching shared protocol
    message_reconciler.dart          [new] Pure ID/version/change merge logic
    messages_screen.dart             [new] Inbox and requests
    conversation_screen.dart         [new] Thread, reply/edit/reaction/unsend UI
  lib/notifications/
    push_service.dart                [new] Permissions, FCM token lifecycle, background entrypoint
    notification_router.dart         [new] Authorized cold/warm tap navigation
  lib/app/{app_scope,router}.dart     [modify] Injection and /messages/:id route
  lib/auth/session_controller.dart   [modify] Messaging/push session cleanup
  lib/placeholders/placeholder_screens.dart [modify] Remove only MessagesScreen placeholder
  lib/shell/app_shell.dart           [modify] Unread badge
  ios/ and android/                  [modify with owner] Firebase/APNs capabilities and app config
  test/messaging/                    [new] Fake transport, state, lifecycle, widget tests
  test/notifications/                [new] Permission/token/tap routing tests
```

### Where the Cloudflare packages go

No new `packages/cloudflare`, `apps/realtime`, or independently deployed socket service is needed. Hono HTTP routes, the Durable Object class, and scheduled dispatch ship from the existing `apps/api` Worker. `cloudflare:workers` is a runtime module, not an npm package to install. `wrangler`, `@cloudflare/workers-types`, and `@cloudflare/vitest-plugin` are already dev dependencies of `apps/api`; use their pinned compatible versions and existing test conventions. Add a new Worker-runtime test config only as required by the pinned plugin.

A Durable Object binding and migration are deployment configuration, not npm dependencies. Put `USER_REALTIME` and a new `new_sqlite_classes` migration for `UserRealtime` in the API Worker configs, including environment-specific bindings where required. Export the class from that Worker's entrypoint. Provision cron there too. Do not put DO/Hyperdrive bindings or push secrets in the separate web Worker. PostgreSQL migrations remain in `packages/db/migrations`, entirely separate from Durable Object migrations.

Web uses its browser-native WebSocket and the pinned `@tanstack/react-query` 5.90.21 dependency in `apps/web`, not the root. `QueryProvider` is remounted by authenticated user ID, cancels and clears its client on unmount, and every messaging key includes that user ID. Result-shaped adapter failures are unwrapped into typed rejections before Query sees them. No query or socket path uses periodic polling. Flutter can use a platform-compatible WebSocket adapter such as `web_socket_channel` in `apps/mobile/pubspec.yaml`; Firebase client packages belong there too. Do not introduce Riverpod or Dio solely for this feature; follow existing controllers and generated-client adapters. Socket code is handwritten, generated clients cover REST only.

## Implementation sequence and independently reviewable pieces

Implement these pieces as focused commits and review checkpoints within messaging PR 2, with tests and ticket dependency links, not additional feature PRs. PR 1 owns the refactor/test/CI foundation. Do not build all tables, infrastructure, and both UIs before demonstrating a vertical text-send slice.

1. **Contract and policy freeze.** Confirm proposed defaults, error/cursor/sequence formats, account lifecycle behavior, and feature flags. Add REST contracts and socket protocol, regenerate clients, and test schemas. No provider deployment required.
2. **Database foundation, existing #26.** Add schema/migrations/reviews, shared pair-lock helper, constraints, least-privilege grants, and tests. Coordinate with relationship owner because lock extraction touches existing writes.
3. **Direct creation, requests, transactional send, existing #27.** Implement initial message and existing-thread send, request acceptance/decline, retry fingerprints, change/outbox insertion, limits. Prove concurrent sender/recipient/block races in real Postgres.
4. **History, inbox, read state, change recovery, existing #28.** Add authorized reads, keyset pagination, unread aggregation, private/shared read positions, and versioned catch-up. Include block-preserved history and safe peer projections.
5. **Foreground client text slice, existing #47 and #32.** Replace placeholders using generated APIs, optimistic text sends, history, inbox, requests, honest pending/failed states. Initially exercise manual refresh in development, not a shipped polling implementation.
6. **Socket auth and runtime, existing #29 then #30.** Ticket issue/consume, DO migration/binding, hibernation, expiry and revocation. Prove with local Worker runtime before staging.
7. **Outbox delivery, existing #31.** Connect bounded immediate dispatch and scheduled repair, lease fencing, channel isolation, logs/metrics. Never put network calls inside write transactions.
8. **Client live synchronization, existing #33 across both clients.** Wire ready/buffer/catch-up, cache invalidation, reconnect backoff, logout, lifecycle, and no-polling disconnected UI. #32/#47 own screens; #33 owns shared behavioral acceptance and recovery, not duplicate screen implementations.
9. **Replies/reactions and edit/unsend.** Separate API correctness from UI action integration if necessary. Tests must cover older loaded messages, pending requests, blocks, version conflicts, safe reply previews, and unsent content removal.
10. **Push registration/delivery and native integration.** Implement device APIs, FCM adapter, session cleanup, Flutter token/tap lifecycle. Mock providers locally. Owners supply staging credentials. Physical-device proof is a separate release gate.
11. **Release verification.** Run full matrix below, collect measured latency/cost evidence, perform staged migrations and feature-flag rollout. Document operator retry/failure procedures.
12. **Deferred group and media follow-ups.** Groups cannot start until policy approval; media cannot start until owner integration is ready. Text release does not depend on either.

Ticket numbers and updated dependency mapping are recorded in [Messaging ticket map](messaging-ticket-map.md). Existing issues #26 through #33 and #47 are retained and rewritten, not deleted. No unrelated social, media, or export ticket should be closed just because it mentions messaging.

### Commit structure for messaging PR 2

Deliver multiple focused commits, not one large messaging commit. Suggested sequence:

1. Approved API/event contracts and generated clients.
2. Schema, additive migrations, shared lock consumption, and database tests.
3. Direct creation, request transitions, transactional sending, and retry tests.
4. Inbox/history/read/change APIs and authorization tests.
5. Socket tickets and authentication tests.
6. Durable Object lifecycle/bindings and Worker-runtime tests.
7. Immediate outbox dispatch, scheduled repair, and lease/failure tests.
8. Web inbox/thread UI, state, and component tests.
9. Flutter inbox/thread UI, state, and widget/controller tests.
10. Cross-client realtime recovery and integration tests.
11. Replies/reactions/editing/unsending with their API and client tests; split further by action if large.
12. Device registration/FCM adapter and provider tests.
13. Flutter push lifecycle and authorized navigation tests.
14. Final end-to-end verification, operational documentation, and release-gate evidence.

Keep the tests for each behavior in that behavior's commit; final verification commits do not replace earlier testing. Some steps may require multiple commits or reorder within the documented dependency graph. Generated clients belong with the contract change that produced them. Coordinate shared manifests/lockfiles and compose changes deliberately when rebasing onto PR 1. Preserve reviewable commit history and do not squash everything into one implementation commit without approval.

## Validation and acceptance matrix

| Layer | Required evidence |
| --- | --- |
| Contracts/routes | All methods have operation IDs, bodies, responses/errors, auth tests, no-store, strict schema rejection, rate-limit behavior. Generated TS and Dart compile against them. Unauthorized conversation/message IDs return 404 without leaks. |
| Database | Migrations apply and verify as intended roles. Duplicate pair creation, sequence allocation, pending one-message concurrency, retry key conflict across threads, and transaction rollback produce no duplicates/orphan outbox jobs. Pair lock serializes send versus block. |
| Policies | Both block directions, accepted then unfriended, declined and pending transitions, deleted accounts, foreign reply target, code-point length, edit exact cutoff/version race, reactions on tombstones, unsend and cached reply clearing. |
| Read state | Two devices update out of order, incoming-only unread counts, private blocked/pending reads do not emit peer receipts but update the actor's other devices, acceptance publishes permitted state, own messages don't inflate unread counts. |
| Outbox | Crash before/after external publication, lease expiry/reclaim, stale-worker acknowledgement rejected, duplicates safe, poison records bounded, push failure doesn't delay socket, immediate dispatch timing recorded. |
| Sockets | Real Worker runtime, single-use/replayed/expired tickets, wrong browser origin, native absence of Origin, spoofed identity headers, session revoke race, idle expiry after hibernation, connection limits, unauthorized publication, multiple devices. |
| Reconnect | Changes during handshake/history fetch, reordered/duplicated events, older edited/unsent message, several catch-up pages, app termination/cache loss, unknown event version, no periodic polling requests while disconnected. |
| Web | Two isolated user contexts plus a second session for the sender. Sends, edits, unsends, reactions, and reads synchronize the sender's other session as well as authorized peer sessions, without duplicate bubbles or self push. Also test keyboard accessibility, focus and scroll preservation, pending retry, offline/reconnect state, logout/account switching clears data, and no XSS from text. |
| Flutter | Fake socket/controller tests, widget tests, foreground/background/resume transitions, no duplicate pending bubble, state clear on logout, deep links after login, accessibility and small-screen behavior. |
| Push | FCM/APNs real iOS/Android devices, denied permission, token rotation, invalid-token cleanup, expired session suppression, account switch, cold/warm taps, private payload and no duplicate foreground banner. |
| Performance/privacy | Healthy foreground p95 under two seconds under stated synthetic workload; SQL plans, batch sizes, event coalescing, DO duration and reconnect burst recorded; logs and traces contain no tokens or message text. |

Existing commands to run from repository root:

```bash
pnpm --filter @dayli/api test
pnpm db:check
pnpm db:test:up
pnpm db:test
pnpm generate:clients
pnpm generate:clients:check
pnpm lint
pnpm typecheck
pnpm verify:local
(cd apps/mobile && flutter analyze && flutter test)
```

Implement new realtime and web test scripts/configuration, then include them in CI and `verify:local` where appropriate. Extend `apps/api/vitest.postgres.config.ts` to include messaging integration tests and any needed local env gates; don't assume a new filename automatically runs. Run `pnpm verify:local:full` when its environment requirements are available. Never run database tests against production. Missing Docker, Flutter, credentials, or device access must be reported as unverified, not a pass.

### Rollout and operations

- Add schema first through the protected workflow in `docs/dayli/database-migrations.md`, then deploy compatible API/DO code, then clients. Keep fields/routes additive for older mobile clients.
- Separate flags for messaging availability, realtime, and push. A realtime failure must not lose accepted messages; show degraded state and permit manual refresh. Do not quietly enable polling.
- Validate staging DO class migration/binding and scheduled trigger independently from Postgres migration success. Do not edit unrelated Hyperdrive-proof configurations unless their compilation requires the new optional binding types.
- Roll back application flags/code without dropping message tables or changing a deployed DO class migration history. Retain unsent semantics during rollback. Drain or pause outbox safely before disabling a delivery destination.
- Track failed outbox jobs, oldest pending age, token invalidations, connection counts, fresh-read failures, and commit-to-render latency. Restrict any administrative replay tooling. No public outbox inspection endpoint.
- Add message/account data to retention, cleanup, and restoration exercises. Rate-limit requests and chat creation as well as messages; initial limits are configurable engineering defaults to approve in the policy ticket.

## Handoff instructions

Read this document and the ticket map first. Existing files above provide the reference patterns; do not repeat broad reconnaissance or import the old backend. Recheck the migration journal and current API signatures only for intervening changes.

Implement the dependency-ordered pieces, with generated contracts and tests in the same PR as behavior changes. Preserve Better Auth as the sole identity authority. Keep database work out of clients and network-provider work out of transactions. Do not implement groups, attachments, typing, or browser push under the text-chat tickets. Escalate unresolved product defaults in the contract/policy ticket rather than silently choosing different behavior.

The architect changed documentation and issue descriptions only. Nothing in this plan is evidence that messaging currently works, Cloudflare resources are provisioned, or FCM/APNs has been verified.
