# Daily post creation

`POST /api/v1/posts` accepts the authenticated user's one post for the current Auckland day. The Worker route, the web composer, and the Flutter composer are implemented. Both clients read `GET /api/v1/posting-days/current`, send an `Idempotency-Key` header, and require the author to choose `solo` or `friends`; there is no default audience. Both send the optional caption and tomorrow note only when they are not blank.

## Request

| Field | Rule |
| --- | --- |
| `localDate` | The Auckland day the draft was written for. It must equal the server's day when the post is accepted. |
| `promptId` | The prompt returned for that day. |
| `reflectiveAnswer` | Required, trimmed, 1–4000 Unicode characters. |
| `caption` | Optional, trimmed, 1–1000 characters. Omit instead of sending an empty string. |
| `rating` | Integer 1–10. |
| `audience` | `solo` or `friends`. |
| `tomorrowNote` | Optional, trimmed, 1–1000 characters. It is stored outside the post and never returned; the response only reports `tomorrowNote.availableOn`. |

The body is strict: unknown fields, including media attachment IDs and any author ID, fail with `422 VALIDATION_FAILED`. Media reservations exist separately, but post attachment linking, upload completion checks, and client upload integration are not implemented. Both composers treat media as optional, keep selected files on the device, and submit text fields only. The generated Dart request model writes omitted optional fields as `null`, which this strict schema rejects, so the Flutter submitter removes null keys before sending.

## Acceptance

The service takes a transaction-scoped advisory lock for the author, then, in order:

1. Replays the stored outcome when the author already used this key. An identical request returns `201` with the original post and `Idempotent-Replayed: true`, even after midnight. A different request returns `409` with `details.reason = IDEMPOTENCY_KEY_REUSED`.
2. Reads server time and rejects a draft for an earlier day (`POSTING_DAY_CLOSED`) or a later day (`POSTING_DAY_NOT_OPEN`). The deadline decision is the accepted write, not request arrival.
3. Rejects a second post for the day under a new key (`ALREADY_POSTED`). The `(author_id, local_date)` unique constraint enforces this independently.
4. Rejects a prompt that is not the day's active prompt (`PROMPT_CHANGED`).
5. Inserts the post with `released_at` at the next Auckland midnight, the optional tomorrow note, and the idempotency record in one transaction.

Only accepted submissions are recorded, so a rejected attempt can be retried with the same key. Clients should keep the draft for every `409` except a replay, and must not backdate a draft that missed midnight.

The Flutter composer follows this rule. Its draft, including the idempotency key, stays in protected storage until a `201`, whether original or replayed. `POSTING_DAY_CLOSED` shows the draft as missed. `PROMPT_CHANGED` and `POSTING_DAY_NOT_OPEN` reload the day and keep the text. `ALREADY_POSTED` and `IDEMPOTENCY_KEY_REUSED` show the unposted words until the author discards them. Opening the composer when the day already has a post does the same for a non-empty draft. When the server's deadline passes while the composer is open, it reloads the posting day so the draft is shown as missed rather than submitted late.

## Storage

`post_idempotency_keys` (migration `0007_regular_kinsey_walden`) is keyed by `(author_id, idempotency_key)` and stores a SHA-256 fingerprint of the normalized request plus the accepted `post_id`. Its foreign keys cascade, so post and account cleanup remove idempotency records with their parent rows.
