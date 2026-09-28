# Messaging delivery integration

This document records the delivery infrastructure that is intentionally separate from messaging REST write ownership.

## Post-commit dispatch hook

`createOutboxDispatcher` in `apps/api/src/infrastructure/jobs/dispatch-outbox.ts` exposes `dispatchImmediately()`. The messaging write route must call it only after its database transaction commits, through `ExecutionContext.waitUntil` with a bounded lifetime. Do not call it from `appendPeerChange` or any database transaction.

```ts
context.executionCtx.waitUntil(dispatcher.dispatchImmediately());
```

The current REST writer atomically writes two realtime records for actor and peer. Before enabling push, its owner must atomically add one `channel = 'push'` outbox row per eligible peer device for new messages and initial requests only. Do not add push work for edits, reactions, reads, or unsends. The push rows must use a distinct event ID or destination identity from realtime rows, and must contain no text.

## Runtime bindings

`USER_REALTIME` is a per-user Durable Object declared in the API Wrangler configurations. The production deploy owner must set `FCM_SERVICE_ACCOUNT_JSON` as a Worker secret. It is never a Wrangler variable or committed configuration. The cron runs every minute and calls the scheduled outbox repair handler.

`UserRealtime` is private to the Worker binding. The external `/realtime/connect` adapter must consume the database ticket, validate the current Better Auth session, enforce browser origins, then forward the upgrade to that binding. Native upgrades without `Origin` remain valid only when they have an issued ticket.

## Required composition work

`app.ts`, `env.ts`, `index.ts`, and messaging route registration are shared integration points. This branch supplies ticket and push route registrars, but deliberately does not register them in `app.ts` while REST ownership is parallel:

- Supply a Better Auth resolver that returns verified `userId`, `sessionId`, and expiry to `RealtimeTicketRouteDependencies` and `PushDeviceRouteDependencies`.
- Register `registerRealtimeTicketRoute` and `registerPushDeviceRoutes` alongside messaging routes, then route the non-OpenAPI WebSocket GET to `connectRealtime`.
- Wire logout and server-side session revocation to `createDurableObjectRealtimePublisher(...).revokeSession(userId, sessionId)`.
- Invoke the bounded immediate dispatcher after successful messaging write commit, as above.

The scheduled handler is already exported from `index.ts`. No body or ticket query value may enter logs, traces, error details, or realtime events.

## External release gates

FCM HTTP v1 is implemented and mock-tested only. Firebase project secrets, APNs/Firebase iOS configuration, Android identifiers, owner-provided Flutter Firebase initialization, and iOS/Android physical-device notification and tap tests remain required before claiming background push delivery.
