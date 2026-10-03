# Plan: Persistent direct-message send quota

**Status:** Approved 2026-10-03.  
**Brief:** [brief.md](brief.md)  
**Specification:** [spec.md](spec.md)

**Approval:** User approved this plan, including PostgreSQL rolling-window enforcement and pair-before-sender lock order, during the AGaw planning session on 2026-10-03.

## Current constraints

- `apps/api/src/features/messaging/conversations/create-direct-conversation/create-direct-conversation.{service,repository}.ts` locks an unordered pair and inserts a first or existing message.
- `apps/api/src/features/messaging/messages/send-message/send-message.{service,repository}.ts` performs idempotency lookup inside a pair-locked conversation transaction, then inserts a message.
- `apps/api/src/features/messaging/messages/shared/conversation-message-transaction.ts` obtains the pair lock before the action.
- `messages` has sender, creation time, and idempotency data, but no `(sender_id, created_at)` index or quota logic.

## Proposed boundary and flow

Create a small messaging shared quota capability, for example `features/messaging/shared/new-message-quota.ts`, with a transaction-level repository operation. Both actions call it only after their existing idempotency lookup and all authorization/state checks required to determine that an insertion is allowed, but immediately before the insert.

Within the caller-owned transaction, after its existing relationship-pair and conversation locks:

1. Acquire a transaction-scoped advisory lock keyed by a namespaced sender ID, using the established `hashtextextended(..., 734)` pattern.
2. Read the authoritative PostgreSQL time.
3. Count rows in `messages` for that sender with `created_at >= database_now - interval '60 seconds'`.
4. If the configured positive limit is reached, return a typed rate-limit domain error with the earliest relevant expiry used to compute `retryAfterSeconds`.
5. Insert the new message in the same transaction. Commit releases the advisory lock.

The idempotency lookup remains before step 1. A conflicting ID remains a conflict before quota enforcement. This preserves exact retries without charging a second time.

## Locking trade-off

An actor advisory lock is recommended over fixed minute buckets because the product rule says rolling 60 seconds and requests can target different conversations. It briefly serializes one actor's sends but does not serialize other actors. The existing relationship-pair and conversation locks are retained and must be acquired first in both message-creation actions. The sender lock follows them, avoiding a new lock-order inversion with existing relationship mutations. This is the main technical risk to verify in real PostgreSQL.

A separate quota ledger was rejected because the authoritative message rows already provide persistent history and exact-window data. Fixed buckets were rejected because they would allow a boundary burst.

## Data and configuration

- Add an additive migration and Drizzle schema index on `(sender_id, created_at)` for the rolling count.
- Add a server-only API Worker environment binding, parsed once at composition. Missing, non-integer, negative, or otherwise malformed values resolve to 30. `0` disables the capability.
- Add the public binding to local and staging example configuration, deployment validation, and operator documentation. It is not a secret.
- Add 429 to both Hono route contracts and regenerate `packages/contracts/openapi.json`, TypeScript client, and Dart client.

## Integration points

- `apps/api/src/env.ts` for the optional configuration binding.
- `apps/api/src/app.ts` for parsing and injecting the configured quota into both services.
- The direct-create and send-message service/repository pairs.
- `packages/db/src/schema/messaging.ts`, a new additive migration, migration review files, and migration metadata.
- Existing route, service, and PostgreSQL integration test locations.

## Rollout and rollback

Deploy the additive index before enabling a nonzero limit. First deploy code with the default safe setting, observe 429 rates and query plans, then tune only through the server-side binding. Set `0` to disable enforcement during rollback. Do not delete messages or quota history.

## Test strategy

- Unit tests for configuration parsing, retry ordering, 429/retry hint, disabled mode, and malformed fallback.
- Route tests for both OpenAPI operations and `Cache-Control: no-store` error behavior.
- PostgreSQL integration tests using separate connections for 30-plus concurrent sends across both endpoints and conversations.
- Query-plan evidence for the sender/time index under representative history.
- `pnpm db:check`, `pnpm db:test`, `pnpm generate:clients`, `pnpm generate:clients:check`, `pnpm --filter @dayli/api test`, `pnpm typecheck`, and `pnpm lint`.

## Risks

The existing message actions take pair locks by different paths. Adding the sender lock inconsistently could deadlock or leave one endpoint unprotected. The implementation must retain pair-before-sender order in both paths and cover it with concurrent integration tests.
