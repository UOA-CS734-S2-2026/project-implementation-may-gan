# Specification: Persistent direct-message send quota

**Status:** Approved 2026-10-03.  
**Brief:** [brief.md](brief.md)

**Approval:** User approved this specification during the AGaw planning session on 2026-10-03.

## Problem

A sender can currently create accepted direct messages through either direct-conversation creation or an existing conversation without a shared messaging quota. This affects recipients exposed to message floods and operators handling abuse. The source code has idempotency and pair/conversation locks, but no actor-wide limiter. This is verified by the absence of quota logic in the two send actions. #255 records the required outcome.

## Success

One authenticated sender creates at most the configured number of new direct messages in every exact rolling 60-second window, regardless of which of the two creation endpoints they use or how many concurrent requests they make.

## User-visible behavior

- The default limit is 30 newly created messages per sender in the prior 60 seconds.
- An exact retry using an already accepted `clientMessageId` returns its canonical result and does not consume quota, even when the sender is otherwise at the limit.
- A conflicting reuse of that ID remains a 409 conflict.
- A newly attempted message beyond the limit returns a documented 429 `RATE_LIMITED` response with a positive retry-after value.
- After the oldest counted message leaves the 60-second window, a new message can be accepted.
- The server-only setting defaults to 30 when missing or malformed. `0` disables this limiter for rollback. A positive integer changes the threshold.

## Scope

Applies only to:

- `POST /api/v1/conversations/direct`
- `POST /api/v1/conversations/{conversationId}/messages`

It counts only a request that passes authorization and creates a new message row.

## Acceptance scenarios

1. **Shared endpoint limit:** A sender creates a mix of first messages and existing-thread messages. At most 30 are persisted in a rolling 60 seconds.
2. **Concurrent requests:** Parallel requests across different conversations cannot exceed the configured limit.
3. **Idempotent retry:** A successful message retried with identical request data returns the saved message without consuming a further slot.
4. **Conflicting retry:** Reusing a saved `clientMessageId` for different content or target returns 409, not 429.
5. **Rejected request:** Invalid text, missing membership, a block, or a pending/declined state failure creates no message and consumes no quota.
6. **Expiry:** A sender becomes eligible once sufficient prior created messages are older than 60 seconds.
7. **Configuration:** Default, positive override, disabled (`0`), and malformed settings have the stated behavior.

## Nonfunctional requirements

- Enforcement survives Worker restarts and multiple isolates.
- The decision is atomic with the insertion, and existing message idempotency remains intact.
- The 429 contract is represented in OpenAPI and regenerated TypeScript and Dart clients.
- The schema change is additive and indexed for the quota query.

## Compatibility and rollout

The feature is backward-compatible for clients except that rapid new-message creation can receive 429. The operator can set the server-only value to `0` or a higher positive value without deleting data or changing accepted messages.

## Out of scope

A general anti-abuse system, per-recipient limits, edits, reactions, reads, friend requests, socket connections, and any dependency on the #131 release gate.

## Resolved decisions

The approved brief fixes the exact sliding-window policy, actor advisory locking, default of 30, `0` rollback setting, and fallback to 30 for malformed configuration.

## Unresolved questions

None affecting expected behavior. The configuration binding name and exact index name are implementation choices.
