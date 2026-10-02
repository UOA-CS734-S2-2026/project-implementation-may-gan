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
| `attachments` | Optional list of up to 3 photos or 1 video, plus at most 1 voice memo, as validated [media reservation](media-reservations.md) IDs, in display order, with no repeats. Omit it or send an empty list for a text-only post. |

The body is strict: unknown fields, including any author ID, fail with `422 VALIDATION_FAILED`. The response includes `media`, the attached photos or video in display order (`id`, `contentType`, `order`); it is empty for a text-only post. It also includes `voiceMemo` (`id`, `contentType`), or `null` when the post has none. Recordings never appear in `media`, so a client that predates audio never sees one there. Download URLs are not part of this response.

Media is optional in both composers. The Flutter composer uploads and validates each attachment through [media reservations](media-reservations.md#flutter-client), won't post until every attachment passes, then sends their reservation IDs as `attachments`. The web composer keeps selected files in the browser and posts text only. The generated Dart request model writes omitted optional fields as `null` and `attachments` as an empty list; the Flutter submitter removes both before sending, so a text-only post works against an API with or without attachment support.

## Acceptance

The service takes a transaction-scoped advisory lock for the author, then, in order:

1. Replays the stored outcome when the author already used this key. An identical request returns `201` with the original post and `Idempotent-Replayed: true`, even after midnight. A different request returns `409` with `details.reason = IDEMPOTENCY_KEY_REUSED`.
2. Reads server time and rejects a draft for an earlier day (`POSTING_DAY_CLOSED`) or a later day (`POSTING_DAY_NOT_OPEN`). The deadline decision is the accepted write, not request arrival.
3. Rejects a second post for the day under a new key (`ALREADY_POSTED`). The `(author_id, local_date)` unique constraint enforces this independently.
4. Rejects a prompt that is not the day's active prompt (`PROMPT_CHANGED`).
5. Locks the author's reservations named in `attachments` (`SELECT … FOR UPDATE`) and checks them. A reservation that is still uploading returns `409` `MEDIA_NOT_READY`. One that doesn't exist, belongs to someone else, failed validation, expired, or is already attached to a post returns `409` `MEDIA_UNAVAILABLE`; these share one message so a response never reveals another user's upload. Mixing photos and a video, more than one video, more than one voice memo, or more than 25 MB in total (the voice memo counts) returns `422 VALIDATION_FAILED` with `details.reason` `MEDIA_NOT_ALLOWED`. The server decides photo, video or audio from the content type recorded at reservation, not from the request. The voice memo is stored after the photos or video, so their `order` values stay contiguous whatever order the client listed them in.
6. Inserts the post with `released_at` at the next Auckland midnight, the optional tomorrow note, one `post_media` row per attachment, and the idempotency record in one transaction.

Only accepted submissions are recorded, so a rejected attempt can be retried with the same key. Clients should keep the draft for every `409` except a replay, and must not backdate a draft that missed midnight.

The Flutter composer follows this rule. Its draft, including the idempotency key, stays in protected storage until a `201`, whether original or replayed. `POSTING_DAY_CLOSED` shows the draft as missed. `PROMPT_CHANGED` and `POSTING_DAY_NOT_OPEN` reload the day and keep the text. `ALREADY_POSTED` and `IDEMPOTENCY_KEY_REUSED` show the unposted words until the author discards them. Opening the composer when the day already has a post does the same for a non-empty draft. When the server's deadline passes while the composer is open, it reloads the posting day so the draft is shown as missed rather than submitted late. If the deadline passes while a submission is in flight, the reload waits until that request settles and is skipped if the post was accepted. The composer is read-only while a submission is in flight, so the draft always matches what was sent and an accepted post never discards later edits.

## Storage

`post_idempotency_keys` (migration `0007_regular_kinsey_walden`) is keyed by `(author_id, idempotency_key)` and stores a SHA-256 fingerprint of the normalized request plus the accepted `post_id`. A request without attachments keeps the original version 1 fingerprint; one with attachments uses version 2, which adds their IDs in order, so changing attachments under the same key is a different request. Its foreign keys cascade, so post and account cleanup remove idempotency records with their parent rows.

`post_media.reservation_id` (migration `0014_link_post_media`) names the upload that holds each attachment's bytes. A partial unique index lets an upload attach once, even after it is detached, and `ON DELETE RESTRICT` stops reservation cleanup deleting an upload a post still uses. Cleanup ([media reservations](media-reservations.md#cleanup)) also checks for a link itself and tombstones an upload under the same row lock this path takes, so a claimed upload is refused with `MEDIA_UNAVAILABLE`. Deleting an account with linked media therefore has to handle its posts first.
