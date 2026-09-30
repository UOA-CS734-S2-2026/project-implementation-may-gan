# Media reservations

`POST /api/v1/media-reservations` reserves an opaque, owned R2 object path and returns a short-lived presigned PUT URL for a client to upload directly to private R2 ([architecture](architecture.md)'s "Direct R2 transfer" — the Worker never proxies the bytes). `GET /api/v1/media-reservations/{id}` reads the caller's own reservation state. `POST /api/v1/media-reservations/{id}/complete` verifies what the client actually uploaded and records a validated/failed outcome. This covers issues #21 and #23: reservation, read, and completion. Download authorisation is issue #24; cleanup of abandoned reservations is issue #25.

## How it works

The Worker never touches upload bytes and never hands the client a reusable R2 credential. It only computes a SigV4 signature (via `aws4fetch`) scoped to:

- one object key (`media/{ownerId}/{reservationId}`, so ownership is structurally encoded in the path),
- one declared `content-type`,
- one declared `content-length` (the declared byte size),
- `if-none-match: *`, R2's conditional-write header,
- a fixed expiry window (`RESERVATION_TTL_SECONDS`, currently 15 minutes — see `apps/api/src/features/media/shared/media-reservation-policy.ts`).

Content-type and content-length are both signed headers on the presigned URL, so R2 rejects any PUT that doesn't send exactly what was declared at reservation time — this is what makes the per-attachment size/type limit enforceable at the storage layer, not just advisory. The 3-attachments/25MB-per-post aggregate limits from [product decisions](product-decisions.md) are not enforced here: there's no post/attachment-linkage entity yet, so only per-attachment size and content type are checkable at reservation time.

`if-none-match: *` makes the upload write-once: R2 only accepts the PUT if no object already exists at that key, and rejects every later PUT to the same key with a 412. Without it, the presigned URL stays valid for the whole `RESERVATION_TTL_SECONDS` window, so a client could upload valid content, let `/complete` validate it, then PUT again with different bytes while the database still reports `validated`. Because it's a signed header, the client must send it exactly as signed — same enforcement mechanism as content-type/content-length above.

Without complete `R2_*` bindings the routes still mount, so they stay in the generated OpenAPI document and clients, but return `503 SERVICE_UNAVAILABLE`. Auth and media reservations fail closed independently, so a missing R2 credential never surfaces as a `500`.

## Completion (issue #23)

Once a client finishes its PUT, it calls `POST /api/v1/media-reservations/{id}/complete`. This performs the checks a signed PUT alone can't (implementation-reference.md §6: "a signed PUT is not content validation"), entirely outside any database transaction — a real `HEAD` confirms the object exists and its actual byte count, a bounded ranged `GET` checks the leading bytes match the declared content type, and a second bounded check confirms each format's other load-bearing structure is actually present, tight enough that a merely-plausible fabrication (not just a bare marker) still fails: a real trailing EOI for JPEG; IHDR/IEND chunks for PNG; for WEBP, a recognised chunk id *and* RIFF/chunk declared sizes that actually match the real file *and* the format's own bitstream signature (VP8L's `0x2F`, VP8's `0x9D 0x01 0x2A` key-frame start code, VP8X's fixed 10-byte body); a `meta` box for HEIC (`apps/api/src/infrastructure/media/media-format.ts`'s `checkEssentialStructure`). For video, the same file's ISO-BMFF box tree is walked (headers only, never bodies) to require at least one video track (a `trak` whose `mdia`/`hdlr` reports `vide`, with its own `mdhd` media header) and a non-empty `mdat`. Every `trak` is considered, not just the first — an audio track can legitimately be listed first and run longer or shorter than the movie. The duration used for the `MAX_VIDEO_DURATION_SECONDS` (15s) cap is the larger of `mvhd`'s (movie-level) and the video track's `mdhd` declared durations, which must agree within a small tolerance, rather than trusting mvhd's single, otherwise-unverified field alone; no video track, or no video track agreeing with mvhd, fails closed as `malformed_container`. None of this is a full decode (still bounded, box-header/signature-byte reads only), so it doesn't and can't prove the payload is genuinely renderable — it closes the specific gaps of "starts with the right marker" and "declares whatever duration it likes," not more.

Only a parser-internal budget-exceeded condition is treated as `malformed_container`; any other exception during these reads (in particular `R2ReadInfrastructureError` from a real R2 outage) propagates to `/complete`'s own handler and becomes `503`, not a permanent stored failure — a transient storage problem must stay retryable, never get recorded as if the content itself were bad. `headR2Object`/`readR2ObjectRange` (`apps/api/src/infrastructure/media/r2.ts`) wrap any error `fetch()` itself throws (not just a bad status) in `R2ReadInfrastructureError` for the same reason.

Only after all of that does one short atomic `UPDATE ... WHERE status='pending' AND expires_at > now()` record the outcome — never while holding a lock during the R2 reads, and re-checking expiry against the database's own clock at claim time so a reservation that lapses mid-completion (e.g. while these R2 reads are in flight) is rejected as expired rather than settled.

A settled outcome (`validated` or `failed`) is terminal and idempotent: repeat calls return the stored result with zero R2 calls, since the bytes at an object key don't change. A client that wants to fix a bad upload reserves again rather than retrying `/complete`. The one non-terminal case is calling `/complete` before the object has actually landed in R2 (`HEAD` 404s) — nothing is persisted, the reservation stays `pending`, and the client can retry until the reservation's TTL expires (`409 CONFLICT` after that).

A failed validation returns `200` with `{status: "failed", failureReason}` rather than a 4xx — the HTTP request to complete succeeded; the uploaded *content* failing is a normal outcome, not a malformed request. `failureReason` is one of `byte_size_mismatch`, `format_mismatch`, `duration_exceeded`, `malformed_container`, or `object_not_found` (only written for the rare case where an object existed at `HEAD` time but vanished before a following read — a genuine race, not the ordinary not-yet-uploaded case).

## One-time Cloudflare setup

1. Create an R2 bucket used only for staging. Do not reuse a production bucket.
2. Create a scoped R2 API token (S3-compatible access key ID/secret) limited to that bucket, **Object Read & Write** only. This is separate from the Cloudflare account API token used for Worker deploys.
3. Configure the bucket's CORS policy to allow `PUT` from the staging web origin, with `content-type`, `content-length`, and `if-none-match` in `AllowedHeaders` — a browser PUTting straight to R2 is a cross-origin request, and the presigned URL signs those three headers, so R2 must both permit and receive them from the client. `if-none-match` is what makes the upload write-once (see "How it works" above); omitting it from `AllowedHeaders` makes the browser's CORS preflight fail and the PUT never reaches R2 at all. This is bucket configuration, not Worker code, and easy to miss.
4. In the GitHub `staging` environment, add the variable `STAGING_R2_BUCKET_NAME` (the bucket name) and the secrets `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` (from step 2). Paste the keys straight from Cloudflare into GitHub; never put them in `vars`, JSON configuration, shell history, or Git.
5. Dispatch the staging API deploy workflow from `main`. `scripts/run-staging-api-deploy.mjs` adds `R2_ACCOUNT_ID` (the deploy's own `CLOUDFLARE_ACCOUNT_ID`) and `R2_BUCKET_NAME` to the generated `wrangler.staging.jsonc`, and `scripts/sync-staging-api-secrets.mjs` pushes the two keys as Worker secrets. R2 is all-or-nothing, like the Google and Resend bindings: a bucket variable without both keys, or keys left on the Worker without the bucket variable, fails the deploy before anything is changed. Before deploying, the workflow also lists the bucket with those two keys, so a misspelled or deleted bucket, or keys that are wrong or scoped to another bucket, fail the deploy instead of producing upload URLs that R2 rejects. With no bucket variable the media routes stay deliberately `503`.

## Local development without real R2 credentials

`pnpm --filter @dayli/api test` covers the reservation and completion routes fully — session handling, quota, expiry (including the TTL race between /complete's pre-check and its atomic claim), ownership, the presigned-URL shape, magic-byte/format and essential-structure checks for all six allowed content types (including WEBP's size/signature checks and the mvhd/mdhd duration cross-check, both with the exact "structurally plausible but fabricated" shapes those checks close), the ISO-BMFF duration walker (valid/oversized/malformed containers, missing trak, missing/empty mdat, missing mdia/mdhd, a duration mismatch beyond tolerance, an audio track listed before the video track, an audio-only file), that a non-budget error propagates instead of being swallowed as `malformed_container`, and idempotent/retryable completion semantics — all with a fake in-memory R2 reader, since none of that logic needs a real network call. `apps/api/src/infrastructure/media/r2.test.ts` separately covers `headR2Object`/`readR2ObjectRange` wrapping a raw `fetch()` failure in `R2ReadInfrastructureError` by stubbing the global `fetch`. Running `wrangler dev` locally without real `R2_*` vars set is also useful: it proves the routes 503 cleanly rather than 500 when the binding is absent or malformed.

None of this uses genuinely real, fully decodable JPEG/PNG/HEIC files — authoring byte-perfect DEFLATE-compressed or DCT-coded scan data by hand isn't something to get subtly wrong silently, and there's no decoder available in this environment to verify it. The fixtures instead use correct, spec-verifiable *markers* at the right offsets (real signature bytes, correct box layouts, consistent declared sizes) — which is what `checkEssentialStructure`/`extractIsoBmffDurationSeconds` actually check. If genuinely real sample files are wanted for stronger test-suite confidence, check in small real binary fixtures rather than hand-encoding them.

What local testing cannot prove is whether Cloudflare's real R2 S3-compatible endpoint actually accepts the SigV4 construction and enforces it as expected, and whether a wrong-type real upload gets rejected by `/complete` end-to-end. Those are covered by a separate deployed check, the same way [authentication compatibility](authentication-compatibility.md) treats a deployed staging check as separate from unit coverage.

## Staging verification

Checked manually against the deployed staging API and `dayli-media-staging` on 2026-09-30, after migrations `0008`–`0013`, using `curl` with synthetic files only:

1. A `PUT` to a real presigned URL with the reserved headers returns `200`, and `/complete` returns `validated`. R2 accepts the SigV4 construction.
2. A `PUT` with a different `content-length` or `content-type` from the reservation returns `403`. R2 enforces the signed headers, so a truncated upload can't reach `/complete`.
3. Random bytes uploaded to an `image/jpeg` reservation fail `/complete` with `format_mismatch`.
4. A second `PUT` to the same presigned URL returns `412 Precondition Failed` rather than overwriting the first upload.
5. `/complete` before any upload returns `pending`, which stays retryable until the reservation expires.

`curl` doesn't send a CORS preflight, so this doesn't cover the bucket's CORS rule. A browser upload from the staging web origin is still unverified. Repeat these checks after changing the signing code or the R2 token.

## Quota and expiry (proposed defaults)

No numeric policy exists elsewhere in these docs for reservation TTL or a per-owner pending-reservation cap. Current defaults, in `apps/api/src/features/media/shared/media-reservation-policy.ts`:

| Constant | Value | Rationale |
| --- | --- | --- |
| `RESERVATION_TTL_SECONDS` | 15 minutes | Matches Better Auth's own reset/verification token TTL precedent in this codebase. |
| `MAX_PENDING_RESERVATIONS_PER_OWNER` | 20 | Abuse guard, not a product-stated limit. It counts only reservations with `expiresAt > now`, so expired reservations no longer count without a cron job. Row deletion remains separate work. |
| `MAX_ATTACHMENT_BYTES` | 10 MB | Pinned by [product decisions](product-decisions.md) and [MVP](mvp.md). |
| `MAX_VIDEO_DURATION_SECONDS` | 15 seconds | Pinned by [product decisions](product-decisions.md) and [MVP](mvp.md). Enforced by issue #23's completion check. |

Revisit these through a reviewed documentation update if the team wants different values, per the change process in [product decisions](product-decisions.md).
