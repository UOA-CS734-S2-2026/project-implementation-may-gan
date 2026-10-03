# Future-self notes

A future-self note is a note the signed-in user writes now and reads on a date they choose. It is owner-only, standalone (not attached to a post), and separate from the [tomorrow note](product-decisions.md#daily-prompt-versions-and-tomorrow-notes). This slice is API only: it stores, schedules, and records delivery. Push alerts (FCM/APNs) are a separate feature, and no client screen exists yet.

All routes need a session and a completed username. A pending account deletion returns `403 FORBIDDEN` for every route, like other content. Responses are `Cache-Control: no-store`.

| Method and path | Purpose |
| --- | --- |
| `POST /api/v1/future-self-notes` | Create a note. Needs an `Idempotency-Key` header. |
| `GET /api/v1/future-self-notes` | List your notes by date, with no text. Paginated. |
| `GET /api/v1/future-self-notes/{noteId}` | Read one note, once its date has arrived. |
| `PATCH /api/v1/future-self-notes/{noteId}` | Edit the text, the date, or both, until delivery. |
| `DELETE /api/v1/future-self-notes/{noteId}` | Delete a note, scheduled or delivered. |

## Fields and limits

| Field | Rule |
| --- | --- |
| `body` | Required, trimmed, 1 to 1,000 Unicode characters. The database checks the same limit. |
| `deliverOn` | An Auckland calendar date (`YYYY-MM-DD`). On create and reschedule it must be from tomorrow up to 10 years after today. The server decides today in Auckland, never the device or the UTC date. |

The body is strict: unknown fields fail with `422 VALIDATION_FAILED`. A date outside the window is `422` with `details.reason` `DELIVER_ON_OUT_OF_RANGE`. Ten years ahead is the same month and day, with 29 February moving to 28 February in a year without one.

A note is returned as `id`, `deliverOn`, `status` (`scheduled` or `delivered`), `deliveredAt`, `createdAt`, and `updatedAt`. Create, list, and edit never return `body`, even to the owner. Only `GET /{noteId}` returns it.

## Reading before and after the date

| When | `GET /{noteId}` |
| --- | --- |
| Before `deliverOn` (Auckland) | `403 FORBIDDEN` with `details.reason` `NOTE_NOT_YET_AVAILABLE`. No text. |
| From `deliverOn`, before the job runs | `200` with `body`. `status` is still `scheduled`. |
| After delivery | `200` with `body`, always. |
| Someone else's note, or an unknown ID | `404 NOT_FOUND`. |

The list shows that a note exists, its date, and its status before the date, which is all the owner learns early. Nobody else can see a note or learn that it exists.

## Create, replay, and conflicts

The service takes a per-owner advisory lock, then:

1. Replays the stored outcome when the owner already used this key. An identical request returns `201` with the original note and `Idempotent-Replayed: true`, even after the date window has moved. A different request returns `409` with `details.reason = IDEMPOTENCY_KEY_REUSED`.
2. Reads server time and checks the date window in Auckland.
3. Inserts the note and its idempotency record in one transaction.

Keys are scoped to the owner and follow their note: deleting a note forgets its key.

## Editing and deleting

An edit takes the owner lock and the note's row lock. A `PATCH` with a new `deliverOn` follows the create window and increases the note's `schedule_version`, which drops any delivery already queued for the old date. Sending the current date again is not a reschedule. After delivery an edit returns `409` with `details.reason` `NOTE_ALREADY_DELIVERED`, but delete still works. A note whose date has arrived but has not been delivered yet can still be edited until the job records the delivery.

## Delivery job

The API Worker's existing one-minute cron runs the delivery job (`apps/api/src/infrastructure/jobs/dispatch-future-self-note-delivery.ts`). It records state only: it sends no push and logs only counts.

1. **Claim.** One transaction selects scheduled notes that are due on today's Auckland date and have no reminder for their current schedule, using `FOR UPDATE SKIP LOCKED`, and inserts a `future_self_note_deliveries` row with a 60-second lease. Owners with a deletion in progress are skipped. Expired leases are taken over, and expired reminders for a schedule that no longer exists are removed.
2. **Complete.** A second transaction re-checks the note, its owner, and its schedule under row locks, then marks the note `delivered` and the reminder `delivered`.

`(note_id, schedule_version)` is unique, so one schedule is delivered at most once however many jobs run, or run at the same time. A reminder is dropped instead of delivered when:

- the note was deleted (the reminder cascades with it),
- the owner's account is pending deletion, purging, or gone (the note stays scheduled and is delivered later if the deletion is cancelled), or
- the note was rescheduled after the claim.

A job holding an expired lease is fenced: its late completion changes nothing.

## Storage and purge order

| Table | Purpose |
| --- | --- |
| `future_self_notes` | Owner, body, date, status, schedule version. Indexes on `(owner_id, deliver_on, id)` and on the due scan `(deliver_on, id) where status = 'scheduled'`. |
| `future_self_note_idempotency_keys` | Accepted create outcomes, keyed by owner and key. |
| `future_self_note_deliveries` | The reminder and delivery record, unique per note and schedule version. Holds no note text. |

Migration `0035_future_self_notes` is additive. The application role has table DML only, and `lifecycle_worker` has none. The note's account key is `NO ACTION`: account cleanup removes delivery and idempotency rows, then notes, then the account. A cleanup that skips a step fails on the foreign key instead of losing data silently. Post Trash cleanup never touches these tables, because a note belongs to its owner, not a post. The export inventory lists the tables, and withholds `body` until an export owner decides how an undelivered note may be exported.

## Not built yet

Push alerts for a delivered note ([#141](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/issues/141)) and clients.

On This Day, the other part of [#39](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/issues/39), is a separate feature. This document does not cover it.
