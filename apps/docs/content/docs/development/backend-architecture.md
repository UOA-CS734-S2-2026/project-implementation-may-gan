---
title: Backend architecture
description: Understand why Dayli organises its API by feature and where each backend responsibility belongs.
---

# Backend architecture

Backend code gets difficult to change when one feature is spread across a folder for every technical layer. A small update then means visiting a global routes folder, a global services folder, a global repositories folder, and a distant test folder. The code may look sorted, but the feature itself is a scavenger hunt.

Dayli organises API implementation code by feature and action instead. The HTTP contract, route, operation logic, and database work for an action stay close together. This is called feature-based organisation and colocation. The goal is practical: a developer can understand an operation without reconstructing it from unrelated folders.

Our target convention is to put every API test suite in an `__tests__` directory under its owner. This keeps implementation files easy to scan while keeping tests close to the feature they check. Messaging already follows this pattern; migrating the remaining API tests is pending. Shared helpers and architecture fixtures keep their dedicated folders.

Colocation does not mean putting every concern in one giant file. The layers still have different jobs. They simply live beside the action they implement.

## The request shape

A Dayli API request generally moves through these responsibilities:

```text
route
  -> optional service
  -> repository or narrow store
  -> PostgreSQL or another runtime provider
```

A contract defines the request and response shape alongside that flow. The target layout puts the action's tests in its `__tests__` directory. Until the migration is complete, some tests still sit directly beside implementation files.

Use only the layers the action needs. A route may call a repository directly for a simple authorized read. An operation with business decisions or several coordinated steps earns a service. Adding a pass-through service to make the folders look symmetrical gives us more files, not more architecture.

## A real Dayli feature

Creating a daily post is a useful representative action because it has validation, authentication, time rules, several writes, and concurrency protection. The tree below shows its intended layout after the test-folder migration, not the current placement of every test.

```text
apps/api/src/features/posts/
  posts.routes.ts
  create-post/
    create-post.contract.ts
    create-post.route.ts
    create-post.service.ts
    create-post.repository.ts
    create-post.memory-store.ts
    __tests__/
      create-post.route.test.ts
      create-post.service.test.ts
      create-post.repository.integration.test.ts
      create-post.advisory-lock.repository.test.ts
      create-post.advisory-lock.repository.integration.test.ts
      create-post-media.repository.integration.test.ts
      create-post-media-cleanup.repository.integration.test.ts
  list-feed/
    list-feed.contract.ts
    list-feed.route.ts
    list-feed.repository.ts
    __tests__/
      list-feed.route.test.ts
      list-feed.repository.test.ts
      list-feed.repository.integration.test.ts
  shared/
    post-content.contract.ts
    post-detail.repository.ts
    post-media.ts
    post-page-cursor.ts
```

`posts.routes.ts` registers the post actions. It does not implement posting rules. Inside `create-post`, the contract owns transport schemas, the route adapts HTTP to the operation, the service owns posting decisions, and the repository owns Drizzle queries, locks, and the transaction. The tests remain close enough that a filename search shows the implementation and its evidence together.

The `shared` directory contains post behavior used by more than one post action. It is not a waiting room for helpers that might become useful someday.

Messaging has one extra grouping level because it is larger. Its action tests are grouped in a separate folder:

```text
features/messaging/<subfeature>/<action>/
  <action>.contract.ts
  <action>.route.ts
  <action>.service.ts       # when the action needs one
  <action>.repository.ts   # when the action needs one
  __tests__/
    <action>.route.test.ts
    <action>.service.test.ts
    <action>.repository.integration.test.ts
```

This is a layout guide, not a requirement that every action has every file. For example, `features/messaging/messages/send-message/__tests__` contains that action's tests.

Its current subfeatures are `messages`, `conversations`, `push`, and `realtime`. Each can have its own `shared` directory, while `messaging/shared` is available to the whole messaging feature.

## What belongs in each layer?

### Contracts

A contract describes valid HTTP input and output. Dayli uses Zod and Hono OpenAPI schemas for this job. Shape checks, required fields, length bounds, and transport examples belong here.

For post creation, the contract validates fields such as the Auckland date, prompt ID, rating, audience, idempotency key, and attachment list. This prevents malformed transport data from entering the operation. It does not decide whether the authenticated user has already posted today. That decision needs current stored state and belongs deeper in the action.

### Routes

A route is the HTTP adapter, or controller if that term is more familiar. It:

- declares the method, path, security, and response contract
- applies reusable HTTP middleware
- reads validated request data and the authenticated actor
- calls the action's service or repository
- maps typed outcomes to status codes, headers, and safe error bodies

Routes should not contain large database queries or the full business policy. Dayli does not add a separate `controller.ts` that merely forwards the same arguments.

### Services

A service owns an application operation when that operation has real rules or coordination. The create-post service checks idempotent retries, the current Auckland posting day, an existing post, the active prompt, and attachment state before asking the transaction to insert the result.

Services depend on narrow capabilities rather than Hono contexts. The create-post service receives a store, a clock, an Auckland day service, and optionally an ID generator. Tests can provide controlled versions of those dependencies without starting an HTTP server or PostgreSQL.

This is dependency injection in its simplest form: the composition code supplies what an operation needs. Dayli uses functions and typed dependency objects. A dependency injection framework or a class hierarchy is not required.

### Repositories and stores

Repositories own persistence details. They build Drizzle queries, map rows, apply database locks, and translate relevant constraints into operation outcomes. They should expose meaningful actions rather than a generic create-read-update-delete base class.

The create-post repository provides `withAuthorTransaction`. It opens one database transaction, takes the author's advisory lock, checks account lifecycle state under locks, and gives the service transaction-scoped operations. The idempotency lookup, one-post check, media locks, and inserts therefore observe one consistent transaction.

This boundary matters. Checking a rule before starting a transaction and then writing later leaves time for another request to change the answer. Rules that can race with a write need the appropriate read or lock inside the same transaction. Database constraints remain useful backstops.

Runtime API repositories use Drizzle's `select`, `insert`, `update`, and `delete` builders. The repository checker rejects runtime access to raw Drizzle `execute()`. Migrations, diagnostics, and test setup have separate needs and are outside that runtime rule.

### Tests

Use the test that matches the responsibility:

- route tests cover validation, authentication behavior, status mapping, and whether dependencies were called
- service tests cover business decisions with controlled stores and clocks
- repository integration tests cover real SQL, constraints, transactions, locks, and rollback with PostgreSQL
- pure shared policy tests check the policy's decisions

The target API test layout is:

| Tests or support | Location relative to `apps/api` |
| --- | --- |
| Feature action tests | `src/features/<feature>/<action>/__tests__/` |
| Messaging action tests | `src/features/messaging/<subfeature>/<action>/__tests__/` |
| Shared feature tests | The owning feature's `shared/__tests__/` |
| HTTP and infrastructure tests | `__tests__/` inside the directory owning the implementation |
| Top-level source tests | `src/__tests__/` |
| Standalone runtime and staging tests | `test/__tests__/` |
| Shared API test helpers | `test/support/`, unchanged |
| Import-boundary fixtures | `test/boundaries/`, unchanged |

This standardisation is pending. Existing post tests still sit beside their implementation, and standalone runtime and staging tests still sit directly under `test`. Current test commands remain documented in [Testing](./testing) until the files and runner configuration move together.

The convention applies to API test suites, not to every helper or fixture, and it does not reorganise web, mobile, or shared-package tests. A separate test folder doesn't change which feature owns the behaviour it checks.

See [Testing](./testing) for commands and for what each passing layer does not prove.

## The three API areas

The source tree separates product operations from transport and provider machinery:

| Area | Owns |
| --- | --- |
| `src/features` | Product features, action contracts, routes, services, repositories, policies, and their focused tests. |
| `src/http` | Cross-feature HTTP concerns such as authenticated actor types, safe API errors, CORS, rate limiting, and session middleware. |
| `src/infrastructure` | Technical adapters for authentication sessions, Hyperdrive database access, jobs, R2 media, push, and realtime delivery. |

A feature can use an infrastructure adapter, but provider details should not take over the feature's business operation. Conversely, infrastructure code should not decide whether a user may edit a particular message or view a particular post.

`apps/api/src/app.ts` is the composition root. It creates and connects concrete services, repositories, clocks, session resolvers, and provider adapters, then passes them to feature registrars. Keeping this wiring in one place lets action tests replace dependencies while production uses the real Worker implementations.

## Where common concerns belong

A request crosses several kinds of validation and permission checks. They belong at the boundary with enough information to enforce them correctly.

| Concern | Home |
| --- | --- |
| JSON, header, path, and response shapes | The action contract and route registration |
| Session identity | Reusable HTTP session middleware backed by Better Auth |
| Broad account capability | Account policy middleware where configured |
| Resource permission | The action's policy, service, or authorized repository query |
| Race-sensitive permission | Inside the same transaction as the write |
| SQL, row mapping, locks, and constraints | The action repository or a narrowly owned shared repository |
| Shared post visibility | The public `features/permissions` entry point used by authorized post queries |
| Current time | An injected clock for operation rules, with database time where the database operation explicitly owns it |
| HTTP status and safe error mapping | The route or shared HTTP error helper |

Authentication answers who is calling. Authorization answers whether that person may perform this operation on this resource now. A valid session alone is not permission to read every post or edit every message.

Never accept a user ID or role from request data as proof of identity. The route reads the actor established by server-side session resolution. OpenAPI security metadata documents this requirement, but middleware performs it.

## Import boundaries are executable rules

Feature folders are useful only if imports respect their ownership. Root `pnpm lint` runs two API architecture checks before ESLint:

```bash
node scripts/check-api-boundaries.mjs
node scripts/check-api-drizzle-queries.mjs
```

The boundary checker enforces the current source layout. In ordinary features, only the feature registrar belongs at the feature root, with explicit exceptions for `auth` and `permissions`. A registrar can import action routes and its feature's shared modules, but it cannot become another service or repository. An action can import its own files, its feature's shared modules, `src/http`, `src/infrastructure`, and workspace packages.

Messaging has stricter ownership. An action may use its own action files, its subfeature's shared modules, and `messaging/shared`. It may not reach into another action or another subfeature's shared directory. The checker also examines type imports, re-exports, dynamic imports, and `require()` calls. Tests have narrow composition exceptions, not a general pass around the architecture.

Features may import the permissions feature only through `features/permissions/index.ts`. Auth, permissions, and the system Hyperdrive compatibility entrypoint have explicit exceptions because their current shapes differ from ordinary HTTP actions.

The query checker scans runtime API TypeScript and rejects direct or aliased calls to Drizzle `execute()`, including transaction aliases. Use the query builders in runtime repositories. Do not rename or disguise a raw call to get around the checker.

Run both through the normal lint command after moving API files:

```bash
pnpm lint
```

## Adding a backend action

Begin with the product operation, not a list of layers.

Imagine adding an action that bookmarks a post. First decide which feature owns it and what permission must hold. Then:

1. Add an action directory under the owning feature.
2. Define the transport contract for the path, input, and possible responses.
3. Add a route that authenticates the caller, reads validated data, and maps outcomes.
4. Add a service only if bookmarking has business rules or coordinates work.
5. Add an action repository when stored data is involved. Keep race-sensitive permission checks with the write transaction.
6. Register the route through the feature registrar and provide concrete dependencies from the composition root.
7. Add focused tests for every layer you created, including denied access and real PostgreSQL behavior where SQL or concurrency matters.
8. Run the boundary and query checks through `pnpm lint`.

Do not call another action's route to reuse behavior. Extract a narrowly named operation under the feature's `shared` directory when two actions genuinely own the same policy or atomic write.

## Changing an existing post rule

Suppose the allowed rating range changes. The first question is what kind of rule changed.

If it is only the accepted request shape, update the contract and its route tests, then regenerate the OpenAPI clients. If the rule depends on the posting day, account state, or existing data, update the service or transaction policy and its tests. If PostgreSQL must guarantee it under concurrent writes, update the repository or schema and add an integration test.

Follow the rule to the layer that can actually prove it. Duplicating the same decision in every layer creates several slightly different truths, which is much less fun than it sounds.

This page explains developer organisation, not individual endpoint behavior. Use the [API reference](/docs/api-reference) for methods and schemas, and link to the relevant system guide when a change depends on product-specific rules.
