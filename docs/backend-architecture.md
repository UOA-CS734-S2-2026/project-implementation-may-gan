# Backend architecture

Status: backend action boundaries are implemented. See the [current architecture](dayli/architecture.md), [refactor implementation plan](implementation/backend-refactor.md), [boundary inventory](implementation/backend-action-boundaries-inventory.md), and [messaging handoff](implementation/messaging-implementation-handoff.md).

## Decisions

- Organize by feature, then action. Messaging contains related message and conversation actions within one ownership boundary.
- Prefix filenames with the action name for fuzzy finding, editor tabs, traces, and search results.
- Keep contracts, HTTP adapters, operation logic, persistence, and tests beside their action.
- Use services and repositories where they have real responsibilities. Do not generate pass-through layers for every endpoint.
- Share specific policies, transactional operations, and technical adapters. Do not create generic base repositories or a large catch-all feature service.
- Use typed Hono middleware for reusable authentication, with Better Auth as the only session authority. Resource-specific authorization remains in the operation and its transaction.
- Keep Cloudflare and push-provider adapters outside HTTP action slices, in `src/infrastructure/`. They still deploy from the existing API Worker.
- Separate structural refactoring from new messaging behavior, database redesign, and API changes.

## Current layers

The repository already separates responsibilities, even though it does not use the word controller:

```text
HTTP request
  -> route.ts                       HTTP/controller responsibilities
  -> service.ts                     Application operation and business rules
  -> repository.ts/postgres-store.ts SQL, transaction and persistence concerns
  -> PostgreSQL
```

Examples are `apps/api/src/features/posts/create-post/`, `posting-days/get-current-posting-day/`, and `media/reserve-upload/`. Relationships now has action-owned routes and services over narrowly shared transaction and policy modules. Auth is a Better Auth integration, not an application CRUD service to duplicate.

`<action>.contract.ts` defines request and response schemas; feature `shared/` contracts hold schemas used by multiple actions. Neither is another execution layer. `packages/domain` currently provides Auckland-day logic. `packages/db` owns database setup, schema and migrations. `apps/api/src/app.ts` is the composition root: it registers feature registrars and supplies concrete dependencies. Existing route tests replace those dependencies with test doubles.

Most protected handlers currently resolve the session explicitly. `apps/api/src/infrastructure/auth/session.ts` exposes a reusable resolver, but wiring varies between features. The inspected relationship resolver returns `{ userId }`; its handlers distinguish unauthenticated callers from authentication infrastructure failure. The user schema contains a nullable `role` column, but that alone is not an enforced RBAC system.

## Registration and import boundaries

Each feature registrar is the only feature-root implementation file. It registers action route functions and shared middleware, but does not contain handler or persistence logic. An action route is the HTTP adapter for one method and path. Its service, repository, contract, and focused route test stay in the action directory when they are action-owned. Feature-shared modules contain narrowly named policies, projections, contracts, and transaction capabilities that are intentionally used by more than one action.

`apps/api/src/features` and API test support under `apps/api/test` are checked by `scripts/check-api-boundaries.mjs`, which runs as part of the root `pnpm lint` command. An action may import its own action files, same-feature `shared/` modules, `src/http`, `src/infrastructure`, and approved workspace packages. It may not import a sibling action or another feature's internals. Test support may import feature-shared modules, but may not aggregate action internals. Cross-action test composition goes through the application composition root. The check covers relative imports, re-exports, dynamic imports, type-only imports, and CommonJS `require` calls. This repository has no TypeScript path aliases, so non-relative specifiers are treated as external boundaries; a future alias must add resolver support and a fixture before use. Workspace package specifiers beginning with `@dayli/` are treated as approved package boundaries. Better Auth provider integration, permissions, and system Hyperdrive compatibility entrypoints are explicit exceptions documented by their feature locations.

## Target file tree

```text
apps/api/src/
  index.ts                                  Worker entry point, exports and scheduled handler
  app.ts                                    App composition and route registration
  env.ts                                    Binding/configuration types
  http/
    middleware/
      require-session.ts                    Typed session middleware factory
      require-session.test.ts               Credential and outage behavior
      cors.ts                               Existing trusted-origin/CORS handling
      cors.test.ts                          Cross-origin request tests
      require-role.ts                       Future only, when real role-protected actions exist
    authenticated-actor.ts                  Server-verified identity type
    api-error.ts                            Existing HTTP error mapping helpers
  features/
    messaging/
      messaging.routes.ts                   Thin registration function, not business logic
      messages/
        send-message/                       Action route and service, with shared message persistence
        edit-message/
        unsend-message/
        set-reaction/
        remove-reaction/
      conversations/
        create-direct-conversation/
        list-conversations/
        get-conversation/
        get-messaging-unread/
        list-messages/
        get-message/
        resolve-message-request/
        mark-conversation-read/
        list-conversation-changes/
      realtime/
        issue-ticket/
        connect/                            Explicit protocol-upgrade adapter, not JSON CRUD
        shared/                             Verified realtime session and ticket types
      push/
        register-device/
        unregister-device/
        shared/                             Device store, service and route dependencies
      shared/
        conversation-access.ts              Membership/block/request authorization helpers
        conversation-types.ts               Conversation operations and transaction capabilities
        conversation.repository.ts           Shared conversation persistence and reads
        message-projection.ts               Safe canonical DTO/reply/tombstone projection
        message-store.ts                    Shared message write transaction interface
        message.contract.ts                Shared message schemas
    posts/
      create-post/                          Existing posts/create action, renamed in refactor
    posting-days/
      get-current-posting-day/
    media/
      reserve-upload/
      get-reservation/
      complete/
      shared/                               Reservation policy, schemas and runtime shared by actions
    relationships/
      relationships.routes.ts               Thin registration only
      get-relationship/
      list-friend-requests/
      send-friend-request/
      accept-friend-request/
      decline-friend-request/
      cancel-friend-request/
      remove-friendship/
      block-user/
      unblock-user/
      shared/                               Pair policy/snapshot and mutation primitives
    permissions/                            Existing shared authorization module, not an HTTP slice
    auth/                                   Better Auth provider integration, intentional exception
    system/
      system.routes.ts                      Thin feature registrar
      get-health/
      get-api-docs/
      test-contracts/                       Explicit test-contract action
  infrastructure/
    auth/                                   Session resolver and lifecycle adapters when extracted
    database/                               Existing Hyperdrive lifecycle helpers
    media/                                  Existing R2 signing/configuration adapters
    realtime/
      user-realtime.ts                      Per-user Cloudflare Durable Object
      publisher.ts                          Internal DO publishing adapter
    jobs/
      outbox-store.ts                        Claims, leases, fencing, retries
      dispatch-outbox.ts                    Immediate and scheduled channel delivery
    push/
      fcm.ts                                Worker-compatible Google OAuth and FCM HTTP v1
```

This is an ownership map, not a requirement to create empty files. Existing auth assets, compatibility entrypoints, and provider-specific handlers may remain grouped when splitting them would fight the provider lifecycle. File and folder changes do not imply URL changes. For example, an `accept-friend-request` action can preserve its existing route path.

## Responsibilities and dependencies

### HTTP adapter

The route validates HTTP input, gets the authenticated actor, invokes the action, maps errors, and sets response headers. It acts as the controller; do not add a second `controller.ts` just to forward arguments. It must not contain large SQL statements or all business policy.

### Application service

A service expresses an operation that has rules or coordination. Messaging has meaningful rules: membership, blocks, one-message pending requests, idempotency, edit deadlines, version conflicts, and atomic delivery intent. These are business logic even when their inputs come from SQL.

Use injected clock, store/transaction capabilities, and narrow external interfaces as needed. Services do not receive Hono `Context` or return HTTP status codes. Typed operation outcomes and errors are mapped by the route. Functions and factories are sufficient; classes are not mandatory.

For a simple read, a route may call an authorized query directly. Do not add a service that only forwards arguments. Authorization remains mandatory and must be evident in tests and the query contract.

### Repository

Keep action-specific queries beside the action. Repositories map rows, implement database constraints/locks, and expose meaningful persistence operations rather than a generic CRUD framework. They may use Drizzle directly internally. Do not create an interface for every Drizzle method or pretend changing database providers is free.

An operation that coordinates multiple writes owns the transaction boundary explicitly. Business predicates that can race with other writes must use reads/locks within that transaction. Checking a block before opening a transaction and blindly inserting afterward is not safe decoupling.

### Shared behavior

Two routes can call the same operation when they genuinely expose the same behavior. Web and Flutter normally call the same endpoint, not separate wrappers.

Two actions needing the same lookup can share a narrowly named query/access helper. Two actions needing the same atomic write can share a function accepting the caller's transaction. For example, create-direct-conversation and send-message use the same safe message insertion mechanism without calling each other's routes or opening unrelated transactions.

Do not make one action call another action's service just to get incidental data. Avoid slice import cycles and generic `shared/utils.ts` dumping grounds. Prefer explicit operations under the owning feature's `shared/` directory. Distinct inbox and history projections do not need to be forced into a single get-everything query.

Cross-feature mechanisms such as the existing relationship pair advisory lock can live in `packages/db`, with exact identity preserved. Pure truly shared business rules may belong in `packages/domain`; do not move every local helper there.

## Authentication and authorization

Hono middleware is the idiomatic equivalent of the reusable checks in tRPC procedures. It does not provide a mandatory procedure abstraction or prescribe service/repository layers.

| tRPC | Hono target |
| --- | --- |
| `protectedProcedure` | Explicit session middleware on protected routes |
| `adminProcedure` | Session middleware, then a role guard if needed |
| `.input(schema)` | Zod OpenAPI request schemas |
| Resolver | Route handler |
| `ctx.user` | Typed context actor |

Use an injected session resolver behind `requireSession`. Better Auth resolves browser cookies and Flutter bearer sessions into one server-verified actor. Never accept actor ID or role from request input. Include verified session ID/expiry when needed by sockets; do not invent them from client input.

Illustrative registration:

```ts
const route = createRoute({
  method: "patch",
  path: "/api/v1/conversations/{id}/messages/{messageId}",
  middleware: [requireSession] as const,
  // Request schemas, OpenAPI security and response definitions.
});
```

`requireSession` above is the configured middleware instance supplied by the app composition root. Specify Hono environment/context types consistently so `context.get("actor")` is typed. Validate middleware ordering against the pinned Hono/Zod OpenAPI versions. OpenAPI `security` documents requirements; it does not execute authentication.

Return 401 for missing/invalid/expired credentials, 503 for unavailable authentication infrastructure, and 403 for a forbidden action or 404 where existence must remain private. Preserve trusted-origin/CSRF protection on cookie mutations; CORS alone is not authorization. Keep private responses no-store, including errors.

Authentication establishes who acts. Optional role checks establish coarse access to an operation. Resource authorization establishes whether this actor may act on this conversation/message now. Membership, sender ownership, blocks, deadlines, and request state belong in the operation's policy/transaction, not only middleware. Every protected action must test unauthenticated denial and prove its service is not invoked.

Do not build RBAC solely because a nullable role column exists. A future admin feature needs approved roles, server-owned assignment, revocation/freshness, and tests. Do not add an implicit admin override for message privacy.

## Tests and tools

| Layer | Tool and ownership |
| --- | --- |
| Policies and services | Existing Vitest, fake clock, small operation-level test doubles |
| Hono HTTP behavior | Existing Vitest and `app.request()`, no listening server required |
| Constraints/transactions/concurrency | Existing Vitest with real Docker PostgreSQL |
| Durable Objects/WebSockets | Existing pinned Cloudflare Vitest integration and Worker runtime |
| Web components | Proposed Vitest + React Testing Library |
| Web end-to-end flows | Proposed Playwright |
| Flutter state/widgets | Existing `flutter_test`, fake transports and clocks |
| FCM/APNs delivery | Mock HTTP provider tests plus physical-device release evidence |

Use `<action>.route.test.ts`, `<action>.service.test.ts`, and `<action>.repository.integration.test.ts` where those modules exist. Test pure policy helpers beside the shared policy. Name tests after the behavior/module instead of ambiguous `test.ts`.

Do not mock Drizzle's chained query builder. Unit tests prove rules; real-Postgres tests prove SQL, locks and rollback. Test boundary wiring with focused integration cases rather than repeating every policy permutation in every layer. Update discovery/configuration before renaming tests so the new integration suffix never silently stops running or runs without its database gate.

## Cloudflare and messaging boundary

Cloudflare-specific code remains in `apps/api`; no new Cloudflare workspace package or separate socket deployment. `cloudflare:workers` is a runtime module. Wrangler, Worker types, and Cloudflare test tooling already live in the API package. DO bindings/migrations and retry cron belong in API Wrangler configs, while SQL migrations belong in `packages/db/migrations`.

REST owns commands and authorized state. Postgres owns history/read state/change records/outbox. Immediately after commit, delivery adapters notify both affected participant users, including the actor's other devices. WebSockets carry small invalidations; clients fetch fresh authorized data. Scheduled retries repair delivery failures. No periodic client polling. The web implementation uses a user-remounted QueryClient and user-ID keys, with action-owned TanStack hooks under `apps/web/features/messaging`. The provider cancels and clears private cache state on account changes. It applies canonical projections to every loaded history page before advancing a durable change cursor, then invalidates dependent conversation, inbox, and unread projections. Push targets eligible peer devices through FCM/APNs and requires owner configuration and device proof. Images remain blocked on R2 integration; groups remain blocked on policy.

For endpoint contracts and messaging-specific data rules, use the [messaging handoff](implementation/messaging-implementation-handoff.md). This architecture document governs organization and boundaries, not changes to those approved product rules.
