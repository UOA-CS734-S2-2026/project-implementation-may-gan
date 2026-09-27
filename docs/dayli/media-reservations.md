# Media reservations

`POST /api/v1/media-reservations` reserves an opaque, owned R2 object path and returns a short-lived presigned PUT URL for a client to upload directly to private R2 ([architecture](architecture.md)'s "Direct R2 transfer" — the Worker never proxies the bytes). `GET /api/v1/media-reservations/{id}` reads the caller's own reservation state. `POST /api/v1/media-reservations/{id}/complete` verifies what the client actually uploaded and records a validated/failed outcome. This covers issues #21 and #23: reservation, read, and completion. Download authorisation is issue #24; cleanup of abandoned reservations is issue #25.

## How it works

The Worker never touches upload bytes and never hands the client a reusable R2 credential. It only computes a SigV4 signature (via `aws4fetch`) scoped to:

- one object key (`media/{ownerId}/{reservationId}`, so ownership is structurally encoded in the path),
- one declared `content-type`,
- one declared `content-length` (the declared byte size),
- `if-none-match: *`, R2's conditional-write header,
- a fixed expiry window (`RESERVATION_TTL_SECONDS`, currently 15 minutes — see `apps/api/src/features/media/policy.ts`).

Content-type and content-length are both signed headers on the presigned URL, so R2 rejects any PUT that doesn't send exactly what was declared at reservation time — this is what makes the per-attachment size/type limit enforceable at the storage layer, not just advisory. The 3-attachments/25MB-per-post aggregate limits from [product decisions](product-decisions.md) are not enforced here: there's no post/attachment-linkage entity yet, so only per-attachment size and content type are checkable at reservation time.

`if-none-match: *` makes the upload write-once: R2 only accepts the PUT if no object already exists at that key, and rejects every later PUT to the same key with a 412. Without it, the presigned URL stays valid for the whole `RESERVATION_TTL_SECONDS` window, so a client could upload valid content, let `/complete` validate it, then PUT again with different bytes while the database still reports `validated`. Because it's a signed header, the client must send it exactly as signed — same enforcement mechanism as content-type/content-length above.

Without complete `R2_*` bindings the routes still mount, so they stay in the generated OpenAPI document and clients, but return `503 SERVICE_UNAVAILABLE`. Auth and media reservations fail closed independently, so a missing R2 credential never surfaces as a `500`.

## Completion (issue #23)

Once a client finishes its PUT, it calls `POST /api/v1/media-reservations/{id}/complete`. This performs the checks a signed PUT alone can't (implementation-reference.md §6: "a signed PUT is not content validation"), entirely outside any database transaction — a real `HEAD` confirms the object exists and its actual byte count, a bounded ranged `GET` checks the leading bytes match the declared content type, and a second bounded check confirms each format's other load-bearing structure is actually present — a real trailing EOI for JPEG, IHDR/IEND chunks for PNG, a recognised chunk id for WEBP, a `meta` box for HEIC — so a payload that merely starts with the right marker can't pass (`apps/api/src/lib/media-format.ts`'s `checkEssentialStructure`). For video, the same file's ISO-BMFF box tree is walked (headers only, never bodies) to require a real `trak` and a non-empty `mdat` in addition to `moov`/`mvhd`, and to extract the real duration and reject anything over `MAX_VIDEO_DURATION_SECONDS` (15s) — this closes the same gap for video that `checkEssentialStructure` closes for images: `ftyp`+`moov`+`mvhd` alone, with no actual track or media data, no longer validates. Only after all of that does one short atomic `UPDATE ... WHERE status='pending' AND expires_at > now()` record the outcome — never while holding a lock during the R2 reads, and re-checking expiry against the database's own clock at claim time so a reservation that lapses mid-completion (e.g. while these R2 reads are in flight) is rejected as expired rather than settled.

A settled outcome (`validated` or `failed`) is terminal and idempotent: repeat calls return the stored result with zero R2 calls, since the bytes at an object key don't change. A client that wants to fix a bad upload reserves again rather than retrying `/complete`. The one non-terminal case is calling `/complete` before the object has actually landed in R2 (`HEAD` 404s) — nothing is persisted, the reservation stays `pending`, and the client can retry until the reservation's TTL expires (`409 CONFLICT` after that).

A failed validation returns `200` with `{status: "failed", failureReason}` rather than a 4xx — the HTTP request to complete succeeded; the uploaded *content* failing is a normal outcome, not a malformed request. `failureReason` is one of `byte_size_mismatch`, `format_mismatch`, `duration_exceeded`, `malformed_container`, or `object_not_found` (only written for the rare case where an object existed at `HEAD` time but vanished before a following read — a genuine race, not the ordinary not-yet-uploaded case).

## One-time Cloudflare setup

1. Create an R2 bucket used only for staging. Do not reuse a production bucket.
2. Create a scoped R2 API token (S3-compatible access key ID/secret) limited to that bucket, **Object Read & Write** only. This is separate from the Cloudflare account API token used for Worker deploys.
3. Configure the bucket's CORS policy to allow `PUT` from the staging web origin, with `content-type`, `content-length`, and `if-none-match` in `AllowedHeaders` — a browser PUTting straight to R2 is a cross-origin request, and the presigned URL signs those three headers, so R2 must both permit and receive them from the client. `if-none-match` is what makes the upload write-once (see "How it works" above); omitting it from `AllowedHeaders` makes the browser's CORS preflight fail and the PUT never reaches R2 at all. This is bucket configuration, not Worker code, and easy to miss.
4. In the ignored `apps/api/wrangler.staging.jsonc` (copied from `wrangler.staging.example.jsonc`), replace the `R2_ACCOUNT_ID` and `R2_BUCKET_NAME` placeholders with the real account ID and bucket name. These are non-secret, same treatment as the existing Hyperdrive ID placeholder.
5. Set the ignored Worker secrets, run from `apps/api`:
   ```bash
   wrangler secret put R2_ACCESS_KEY_ID --config wrangler.staging.jsonc
   wrangler secret put R2_SECRET_ACCESS_KEY --config wrangler.staging.jsonc
   ```
   Never put these in `vars`, JSON configuration, shell history, or Git.

## Local development without real R2 credentials

`pnpm --filter @dayli/api test` covers the reservation and completion routes fully — session handling, quota, expiry (including the TTL race between /complete's pre-check and its atomic claim), ownership, the presigned-URL shape, magic-byte/format and essential-structure checks for all six allowed content types, the ISO-BMFF duration walker (valid/oversized/malformed containers, missing trak, missing/empty mdat), and idempotent/retryable completion semantics — all with a fake in-memory R2 reader, since none of that logic needs a real network call. Running `wrangler dev` locally without real `R2_*` vars set is also useful: it proves the routes 503 cleanly rather than 500 when the binding is absent or malformed.

What local testing cannot prove is whether Cloudflare's real R2 S3-compatible endpoint actually accepts the SigV4 construction and enforces it as expected, and whether a genuinely truncated or wrong-type real upload gets rejected by `/complete` end-to-end. Once staging R2 secrets exist, do two one-time manual checks, the same way [authentication compatibility](authentication-compatibility.md) treats a deployed staging check as separate from unit coverage:

1. `curl -X PUT` against a real presigned URL, confirming R2 accepts the SigV4 construction and rejects a mismatched `content-length`/`content-type`.
2. Upload a genuinely truncated or wrong-type file through a real reservation, then call `/complete` and confirm it's rejected with the expected `failureReason`.
3. Repeat the same `curl -X PUT` (with `if-none-match: *` and matching `content-type`/`content-length`) a second time against the same presigned URL, confirming R2 rejects it with `412 Precondition Failed` rather than silently overwriting the first upload.

## Quota and expiry (proposed defaults)

No numeric policy exists elsewhere in these docs for reservation TTL or a per-owner pending-reservation cap. Current defaults, in `apps/api/src/features/media/policy.ts`:

| Constant | Value | Rationale |
| --- | --- | --- |
| `RESERVATION_TTL_SECONDS` | 15 minutes | Matches Better Auth's own reset/verification token TTL precedent in this codebase. |
| `MAX_PENDING_RESERVATIONS_PER_OWNER` | 20 | Abuse guard, not a product-stated limit. It counts only reservations with `expiresAt > now`, so expired reservations no longer count without a cron job. Row deletion remains separate work. |
| `MAX_ATTACHMENT_BYTES` | 10 MB | Pinned by [product decisions](product-decisions.md) and [MVP](mvp.md). |
| `MAX_VIDEO_DURATION_SECONDS` | 15 seconds | Pinned by [product decisions](product-decisions.md) and [MVP](mvp.md). Enforced by issue #23's completion check. |

Revisit these through a reviewed documentation update if the team wants different values, per the change process in [product decisions](product-decisions.md).
