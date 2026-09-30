# Drizzle SQL-expression cleanup

Status: draft PR #176 against main. The media reservation dependency proposal remains separate. Do not merge this PR automatically.

## Goal

Make API persistence code easier to read by selecting stored columns directly and using Drizzle helpers when they express the same one-statement query. Keep bounded PostgreSQL expressions for behavior that the installed Drizzle 0.45.2 API cannot express without changing locks, query count, cursor precision, or update atomicity. The goal is not zero `sql` tags.

The baseline had 183 `sql` tagged fragments in 35 production `apps/api/src` files. The current PR has 101 in 31 files, so it removes 82 fragments. These are expressions inside Drizzle builders, not 183 raw statements. The baseline categories below guided the audit; the remaining expressions are recorded file by file at the end.

## Supported number range

Message and conversation sequences are per-conversation counters. Treat values within `Number.MAX_SAFE_INTEGER` as supported, while retaining the public string fields for sequences and cursors. Validate numeric cursor input before converting it to a number. Reject an unsafe database result rather than returning a rounded cursor. Remove precision-only `::text` and `::bigint` casts only after callers use typed Drizzle rows consistently. Prefer to preserve existing internal `bigint` interfaces where they keep transaction and event code stable: assert a selected number is safe before converting it to an internal `bigint`, and convert it back to a safe number when a Drizzle number-mode column needs an input. Avoid broad changes to stored message or outbox job types solely to remove casts. Existing tests that expect exact values above the supported range should instead assert explicit rejection; keep ordinary pagination and concurrency coverage. No schema migration is proposed solely for this limit.

This is a deliberate change to the behavior of out-of-range values, not a mechanical rewrite. Apply it consistently across message and conversation reads and writes. The existing outbox job contract remains an exact string: keep its single `change_sequence::text` projection rather than risk rounding a previously queued event. Do not mix unchecked strings and number-mode values in one transaction.

## Expression inventory

| Current use | Initial count | Proposed treatment |
| --- | ---: | --- |
| Bigint precision casts | 49, including 37 `::text` and 12 `::bigint` | Candidate for coordinated removal under the supported number range. Expressions that also perform an atomic update need a separate review. |
| Plain counts and count casts | 7 | Use Drizzle `count()` when it preserves the same grouped or correlated query. Do not split a statement. |
| Predicates, existence tests, and literals | 31 | Replace supported expressions with `exists`, `notExists`, `eq`, `ne`, `and`, `or`, and real selected columns. Inspect null behavior first. |
| Database functions and atomic values | 57 | Mixed category. Keep database-clock checks, `coalesce`, `lower`, `CASE`, increments, and conflict references where moving them into JavaScript changes behavior. |
| Advisory lock expressions and one-row sources | 15 | Keep PostgreSQL transaction locks and their keys. Drizzle does not have an advisory-lock helper. |
| Filtered or grouped PostgreSQL aggregates | 4 | Keep `FILTER` and `bool_or` where a builder rewrite adds scans or changes the grouped result. |
| Cursor and timestamp expressions | 7 | Keep microsecond formatting and PostgreSQL timestamp comparisons. JavaScript `Date` cannot preserve microseconds. |
| Other expressions | 13 | Review one by one, particularly `excluded.*` conflict-update references and pass-through column expressions. |

The counts classify tagged templates by their most obvious purpose, not by whether they are removable. They must be checked against the source before editing.

## Work order

1. Replace simple native-helper opportunities in media counts, permissions, post edited markers, push/realtime existence checks, and relationship predicates. Keep the same statement and selected result.
2. Give message reads a typed Drizzle row projection shared by get, list, and reply projection. Remove duplicated column lists and raw-row adapters only when DTO output and query count remain unchanged.
3. Convert message, member, conversation, and change projections with safe-number validation. Keep atomic increments in the database. Retain the exact-string outbox job projection. Rework messaging high-sequence fixtures to test rejection rather than silent rounding.
4. Review remaining fragments file by file. For each kept expression, record the PostgreSQL behavior it protects. Do not replace a correlated count or filtered aggregate with another round trip merely to remove `sql`.
5. Compare generated SQL, run API unit and Worker tests, the full disposable PostgreSQL verifier, typecheck, lint, and generated-client checks. Confirm that public OpenAPI and clients remain unchanged. Review locks, permission decisions, pagination, and outbox effects before marking draft PR #176 ready.

## Remaining runtime SQL

Paths below are relative to `apps/api/src/`. Counts are tagged expressions, not statements. The one outbox text cast is deliberate. The other 100 fragments retain database-side functions, literals, locks, aggregates, and cursor comparisons where a native helper is absent or moving the work into JavaScript would complicate the query.

| File | Tags | Reason to keep |
| --- | ---: | --- |
| `app.ts` | 1 | Database clock for a session check. |
| `features/media/shared/media-reservation.repository.ts` | 4 | Quota advisory lock, one-row lock source, and database-clock expiry. |
| `features/messaging/conversations/create-direct-conversation/create-direct-conversation.repository.ts` | 7 | PostgreSQL `least`/`greatest` pair ordering, atomic message allocation, and pair advisory lock. |
| `features/messaging/conversations/get-conversation/get-conversation.repository.ts` | 1 | Database-side display-name fallback. |
| `features/messaging/conversations/get-direct-conversation/get-direct-conversation.repository.ts` | 2 | PostgreSQL pair ordering in lookup. |
| `features/messaging/conversations/get-messaging-unread/get-messaging-unread.repository.ts` | 2 | Two filtered counts from one joined scan. |
| `features/messaging/conversations/list-conversations/list-conversations.repository.ts` | 5 | Microsecond activity cursor, timestamp tuple comparison, lateral join condition, peer selection, and display-name fallback. |
| `features/messaging/conversations/mark-conversation-read/mark-conversation-read.repository.ts` | 5 | Pair advisory lock, atomic read/receipt `greatest`, and database time. |
| `features/messaging/conversations/resolve-message-request/resolve-message-request.repository.ts` | 4 | Pair advisory lock, display-name fallback, and database time. |
| `features/messaging/messages/send-message/send-message.repository.ts` | 2 | Atomic sequence increment and database time. |
| `features/messaging/messages/set-reaction/set-reaction.repository.ts` | 2 | Database-time write conditions. |
| `features/messaging/messages/shared/message-write-primitives.ts` | 4 | Actor reaction `bool_or`, atomic change increment, and database time. |
| `features/messaging/messages/shared/update-message-row.ts` | 1 | Atomic message-version increment. |
| `features/messaging/push/register-device/register-device.repository.ts` | 10 | Session/ban database-time checks and eight incoming-row `excluded` upsert references. |
| `features/messaging/realtime/issue-ticket/issue-ticket.repository.ts` | 1 | Database-time ticket expiry. |
| `features/messaging/shared/append-conversation-change.ts` | 2 | Atomic change increment and database time for live push devices. |
| `features/messaging/shared/message-projection.ts` | 1 | Actor-specific grouped reaction `bool_or`. |
| `features/permissions/drizzle.ts` | 6 | Literal true/false branches for owner, friends, grant, media, and tomorrow-note decisions. |
| `features/posts/create-post/create-post.repository.ts` | 2 | Advisory lock and one-row source for pair-scoped post work. |
| `features/posts/get-post/get-post.repository.ts` | 1 | Database-side display-name fallback. |
| `features/posts/list-feed/list-feed.repository.ts` | 2 | Display-name fallback and date-tuple keyset cursor. |
| `features/profiles/username/username.repository.ts` | 1 | Database-clock update timestamp. |
| `features/relationships/shared/get-profile.repository.ts` | 7 | Case-folded lookup, relationship-state `CASE`, name fallback, and nullable ban expiry. |
| `features/relationships/shared/list-friend-requests.repository.ts` | 5 | Exact timestamp cursor, opposite participant `CASE`, name fallback, and ban expiry. |
| `features/relationships/shared/list-friends.repository.ts` | 5 | Case-folded ordering/cursor, name fallback, and ban expiry. |
| `features/relationships/shared/relationships.repository.ts` | 2 | Pair advisory lock and one-row source. |
| `features/relationships/shared/search-users.repository.ts` | 9 | Search advisory lock, relationship-state `CASE`, escaped case-insensitive prefix match, name and ban fallback, and lowercased keyset cursor. |
| `infrastructure/jobs/outbox-store.ts` | 2 | Exact string change sequence for existing delivery jobs and atomic lease-attempt increment. |
| `infrastructure/push/push-destination.repository.ts` | 3 | Database-time session, ban, and invalidation checks. |
| `infrastructure/realtime/publisher.ts` | 1 | Database-time delivery authorization. |
| `infrastructure/realtime/user-realtime.ts` | 1 | Database-time session validity. |

The outbox keeps `change_sequence::text` so a queued job can supply an exact realtime string without rounding. A number-mode selection would lose that guarantee for previously queued large values. Changing the delivery representation for one cast is not needed to make this PR's query builders readable. Migrations, diagnostics, and test fixtures remain outside this runtime inventory.
