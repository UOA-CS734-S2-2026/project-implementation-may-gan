# Brief: Persistent direct-message send quota

**Status:** Approved 2026-10-03. This is a brief, not an implementation authorization.

## Sources

- [#255: Limit direct-message creation to 30 messages per rolling minute](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/issues/255)
- Historical context only: closed [#127](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/issues/127)
- Background only, not an approved spec: `docs/implementation/messaging-implementation-handoff.md`

## Problem and impact

Messaging has idempotency, request-state restrictions, and other limits, but no app-specific sender-wide quota for newly accepted messages. A sender can create excessive direct messages across direct-conversation creation and existing-thread sends, harming recipients and platform operations.

## Intended outcome

A sender cannot create more than the configured number of new direct messages in any exact rolling 60-second window. The initial default is 30. The protection is persistent and safe across Worker isolates and concurrent requests.

## Current and desired behavior

| Current fact | Desired behavior |
| --- | --- |
| `POST /api/v1/conversations/direct` and `POST /api/v1/conversations/{conversationId}/messages` each create messages with action-specific transactions. There is no actor-wide messaging quota. | Both endpoints use one shared quota capability before a newly accepted message is inserted. |
| Exact idempotency replay is already detected before an insert. | An exact replay returns the current canonical result before quota checking and consumes no quota. Conflicting reuse remains a 409. |
| Existing locks protect pairs/conversations, not all concurrent sends by one actor. | A transaction-scoped advisory lock per sender serializes count-and-insert decisions across conversations. |

## Rules

- Use an exact sliding window: under the sender advisory lock, count that sender's newly created messages with `created_at` in the prior 60 seconds, then permit insertion only when the count is below the configured limit.
- Count only an authenticated, authorized request that creates a new persisted message.
- Invalid, blocked, rejected, and exact replay requests do not consume quota.
- The quota applies equally to first messages and existing-thread sends.
- Exceeding the quota returns a documented 429 response with retry guidance.
- Configuration is server-only. Missing or malformed configuration uses the safe default of 30. `0` disables the limiter for rollback. A positive integer changes the threshold.
- Add required indexes and configuration support through additive reviewed migrations. Never delete messages or rewrite prior history to roll back.

## Scope

- Shared quota capability used by the two message-creation actions.
- Transaction/locking, persistence/indexing, API error contract, generated clients, configuration, tests, validation, and rollback documentation.

## Exclusions

- A general anti-abuse system.
- Limits for edits, reactions, reads, request resolution, realtime reconnects, or unrelated API features.
- Making the release gate in #131 wait for this non-blocking follow-up.

## Acceptance examples and edge cases

- Thirty concurrent first-message and existing-thread sends from one sender persist at most 30 new messages in the same rolling minute.
- Retrying an accepted request after the quota is reached returns the original canonical message without a quota charge.
- Reusing an accepted client message ID with different request content remains a 409.
- Once the oldest counted message leaves the 60-second window, a new message can be accepted.
- Two different Worker requests cannot bypass the limit because they target different conversations.

## Dependencies

Implemented messaging send foundation, historically #27. This feature is independent of the notification briefs and remains non-blocking for #131.

## Validation

- Focused service and route tests for replay, conflict, 429, retry guidance, configuration, and disabled mode.
- Real PostgreSQL concurrency tests across both endpoints and conversations.
- Migration/index checks, generated-client equality, API typecheck, and lint.

## Risk and rollback

A threshold that is too low can interrupt legitimate rapid sends. Operators can set the server value to `0` or a higher positive value without deleting messages. A malformed value retains the default protection rather than silently disabling it.

## Decisions and provenance

- User decision: use an exact sliding 60-second count under a per-sender advisory transaction lock.
- User decision: default to 30, use `0` to disable, and fall back to 30 for missing or malformed configuration.
- User decision: all briefs were approved for saving.

## Unknowns

The exact configuration binding name and migration/index implementation are design choices for the later specification. They must preserve current locking order and database conventions.
