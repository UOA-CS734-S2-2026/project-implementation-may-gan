# Backend action boundary inventory

This inventory records the baseline used for the backend action boundary refactor.

## Contract baseline

The checked-in `packages/contracts/openapi.json` at commit `5cf1be2` and a freshly generated document from that commit were byte-identical. After the refactor, a fresh document is also byte-identical to that baseline. The OpenAPI inventory contains 35 operations:

```text
DELETE /api/v1/conversations/{conversationId}/messages/{messageId} unsendMessage
DELETE /api/v1/conversations/{conversationId}/messages/{messageId}/reaction removeMessageReaction
DELETE /api/v1/push/devices/{installationId} unregisterPushDevice
DELETE /api/v1/relationships/{userId}/block relationships.unblock
DELETE /api/v1/relationships/{userId}/friendship relationships.removeFriendship
GET /api/v1/conversations listConversations
GET /api/v1/conversations/{conversationId} getConversation
GET /api/v1/conversations/{conversationId}/changes listConversationChanges
GET /api/v1/conversations/{conversationId}/messages listMessages
GET /api/v1/conversations/{conversationId}/messages/{messageId} getMessage
GET /api/v1/health system.health
GET /api/v1/media-reservations/{id} media.reservations.get
GET /api/v1/messaging/unread getMessagingUnread
GET /api/v1/posting-days/current postingDays.current
GET /api/v1/relationships/friends relationships.listFriends
GET /api/v1/relationships/requests relationships.listPendingRequests
GET /api/v1/relationships/search relationships.searchUsers
GET /api/v1/relationships/{userId} relationships.getStatus
GET /api/v1/test system.testContracts
PATCH /api/v1/conversations/{conversationId}/messages/{messageId} editMessage
POST /api/v1/conversations/direct createDirectConversation
POST /api/v1/conversations/{conversationId}/messages sendMessage
POST /api/v1/media-reservations media.reservations.create
POST /api/v1/media-reservations/{id}/complete media.reservations.complete
POST /api/v1/posts posts.create
POST /api/v1/realtime/tickets createRealtimeTicket
POST /api/v1/relationships/requests relationships.sendRequest
POST /api/v1/relationships/requests/{requestId}/accept relationships.acceptRequest
POST /api/v1/relationships/requests/{requestId}/cancel relationships.cancelRequest
POST /api/v1/relationships/requests/{requestId}/decline relationships.declineRequest
POST /api/v1/relationships/{userId}/block relationships.block
PUT /api/v1/conversations/{conversationId}/messages/{messageId}/reaction setMessageReaction
PUT /api/v1/conversations/{conversationId}/read markConversationRead
PUT /api/v1/conversations/{conversationId}/request resolveMessageRequest
PUT /api/v1/push/devices/{installationId} registerPushDevice
```

The protocol-upgrade route `GET /api/v1/realtime/connect` is registered outside OpenAPI. Better Auth continues to handle its `/api/auth/*` GET and POST compatibility routes. The `/api/v1/test` operation remains a test-contract route and is included in the OpenAPI inventory.

## Test discovery baseline

The API unit suite remains `apps/api/vitest.config.ts`. PostgreSQL discovery includes feature `postgres.integration.test.ts` files, action or shared `*.repository.integration.test.ts` files, permissions tests, and infrastructure integration tests. The realtime Worker-runtime suite remains `apps/api/vitest.realtime.config.ts` and covers `src/infrastructure/realtime/**/*.runtime.test.ts`.

`registerMessagingRoutes` is called once by `app.ts` and registers 17 OpenAPI messaging actions plus the non-OpenAPI realtime connect protocol adapter, including push and realtime. The relationships registrar registers 11 actions, the media registrar registers three OpenAPI actions, and the system registrar registers health, test contracts, and the non-OpenAPI docs route. The default app route table has 101 entries at the baseline and 99 after the refactor: the messaging registrar consolidates three identical conversation wildcard session middleware registrations into one, with no duplicate endpoint registrations. Better Auth and the system Hyperdrive compatibility entrypoints retain their provider and runtime exceptions.
