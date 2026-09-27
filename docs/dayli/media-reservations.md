# Media reservations

`POST /api/v1/media-reservations` reserves an opaque, owned R2 object path and returns a short-lived presigned PUT URL for a client to upload directly to private R2. The Worker never proxies the bytes. `GET /api/v1/media-reservations/{id}` reads the caller's own reservation state. The checked-in work covers reservation creation and read. Neither client calls these routes yet, staging has no R2 credentials, and no deployed upload has been tested. Actual upload validation of byte count and real format, download authorisation, and cleanup of abandoned reservations remain separate work.

## How it works

The Worker never touches upload bytes and never hands the client a reusable R2 credential. It only computes a SigV4 signature (via `aws4fetch`) scoped to:

- one object key (`media/{ownerId}/{reservationId}`, so ownership is structurally encoded in the path),
- one declared `content-type`,
- one declared `content-length` (the declared byte size),
- a fixed expiry window (`RESERVATION_TTL_SECONDS`, currently 15 minutes — see `apps/api/src/features/media/policy.ts`).

Content-type and content-length are both signed headers on the presigned URL, so R2 rejects any PUT that doesn't send exactly what was declared at reservation time — this is what makes the per-attachment size/type limit enforceable at the storage layer, not just advisory. The 3-attachments/25MB-per-post aggregate limits from [product decisions](product-decisions.md) are not enforced here: there's no post/attachment-linkage entity yet, so only per-attachment size and content type are checkable at reservation time.

Without complete `R2_*` bindings the routes still mount, so they stay in the generated OpenAPI document and clients, but return `503 SERVICE_UNAVAILABLE`. Auth and media reservations fail closed independently, so a missing R2 credential never surfaces as a `500`.

## One-time Cloudflare setup

1. Create an R2 bucket used only for staging. Do not reuse a production bucket.
2. Create a scoped R2 API token (S3-compatible access key ID/secret) limited to that bucket, **Object Read & Write** only. This is separate from the Cloudflare account API token used for Worker deploys.
3. Configure the bucket's CORS policy to allow `PUT` from the staging web origin, with `content-type` and `content-length` in `AllowedHeaders` — a browser PUTting straight to R2 is a cross-origin request, and the presigned URL signs those two headers, so R2 must both permit and receive them from the client. This is bucket configuration, not Worker code, and easy to miss.
4. In the ignored `apps/api/wrangler.staging.jsonc` (copied from `wrangler.staging.example.jsonc`), replace the `R2_ACCOUNT_ID` and `R2_BUCKET_NAME` placeholders with the real account ID and bucket name. These are non-secret, same treatment as the existing Hyperdrive ID placeholder.
5. Set the ignored Worker secrets, run from `apps/api`:
   ```bash
   wrangler secret put R2_ACCESS_KEY_ID --config wrangler.staging.jsonc
   wrangler secret put R2_SECRET_ACCESS_KEY --config wrangler.staging.jsonc
   ```
   Never put these in `vars`, JSON configuration, shell history, or Git.

## Local development without real R2 credentials

`pnpm --filter @dayli/api test` covers the reservation routes with fake R2 credentials: session handling, quota, expiry, ownership, and the presigned-URL shape. Presigning is a local computation and makes no network call. Running `wrangler dev` locally without real `R2_*` vars also shows that the routes return `503` rather than `500` when the binding is absent or malformed.

What local testing cannot prove is whether Cloudflare's real R2 S3-compatible endpoint actually accepts the SigV4 construction, and whether it actually rejects a PUT whose `content-length`/`content-type` don't match what was signed. Once staging R2 secrets exist, do a one-time manual `curl -X PUT` against a real presigned URL to confirm both, the same way [authentication compatibility](authentication-compatibility.md) treats a deployed staging check as separate from unit coverage.

## Quota and expiry (proposed defaults)

No numeric policy exists elsewhere in these docs for reservation TTL or a per-owner pending-reservation cap. Current defaults, in `apps/api/src/features/media/policy.ts`:

| Constant | Value | Rationale |
| --- | --- | --- |
| `RESERVATION_TTL_SECONDS` | 15 minutes | Matches Better Auth's own reset/verification token TTL precedent in this codebase. |
| `MAX_PENDING_RESERVATIONS_PER_OWNER` | 20 | Abuse guard, not a product-stated limit. It counts only reservations with `expiresAt > now`, so expired reservations no longer count without a cron job. Row deletion remains separate work. |
| `MAX_ATTACHMENT_BYTES` | 10 MB | Pinned by [product decisions](product-decisions.md) and [MVP](mvp.md). |

Revisit these through a reviewed documentation update if the team wants different values, per the change process in [product decisions](product-decisions.md).
