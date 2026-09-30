# Drizzle SQL-expression cleanup

Status: inventory and implementation plan for a new PR stacked on #171. This is separate from the media reservation dependency proposal. Do not merge either PR automatically.

## Goal

Make API persistence code easier to read by selecting stored columns directly and using Drizzle helpers when they express the same one-statement query. Keep bounded PostgreSQL expressions for behavior that the installed Drizzle 0.45.2 API cannot express without changing locks, query count, cursor precision, or update atomicity. The goal is not zero `sql` tags.

The baseline has 183 `sql` tagged fragments in 35 production `apps/api/src` files. These are expressions inside Drizzle builders, not 183 raw statements. The inventory categories below are provisional, and one expression can serve more than one purpose. Do not promise a removal count before reviewing each replacement against its generated SQL and existing tests.

## Supported number range

Message and conversation sequences are per-conversation counters. Treat values within `Number.MAX_SAFE_INTEGER` as supported, while retaining the public string fields for sequences and cursors. Validate numeric cursor input before converting it to a number. Reject an unsafe database result rather than returning a rounded cursor. Remove precision-only `::text` and `::bigint` casts only after callers use typed Drizzle rows consistently. Existing tests that expect exact values above the supported range should instead assert explicit rejection; keep ordinary pagination and concurrency coverage. No schema migration is proposed solely for this limit.

This is a deliberate change to the behavior of out-of-range values, not a mechanical rewrite. Apply it together across messages, conversation watermarks, members, change records, and outbox jobs. Do not mix string-safe and number-mode representations in one transaction.

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
3. Convert message, member, conversation, change, and outbox numeric projections together. Validate safe-number cursors and returned values. Keep atomic increments in the database. Rework the high-sequence fixtures to test rejection rather than silent rounding.
4. Review remaining fragments file by file. For each kept expression, record the PostgreSQL behavior it protects. Do not replace a correlated count or filtered aggregate with another round trip merely to remove `sql`.
5. Compare generated SQL, run API unit and Worker tests, the full disposable PostgreSQL verifier, typecheck, lint, and generated-client checks. Confirm that public OpenAPI and clients remain unchanged. Review locks, permission decisions, pagination, and outbox effects before opening the stacked PR.
