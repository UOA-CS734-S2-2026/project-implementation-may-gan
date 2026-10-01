# Self-service data export backend contract

Issue #162 remains draft work. The scheduled worker is registered only when `DATA_EXPORT_WORKER_ENABLED` is exactly `true`, `DATA_EXPORT_WORKER_HYPERDRIVE` is present, and the complete R2 configuration parses. The default is disabled. No deployment setting changes this document makes the worker live.

## Implemented backend surface

- `POST`, `GET`, and `DELETE /api/v1/account/export` require an authenticated account-management session. The `export` capability permits active and pending-deletion accounts. Purging states fail closed.
- The partial unique index permits one active request. Replayed concurrent requests return that request. Cancellation applies only before publication. Ready archives go through durable expiry cleanup.
- `GET /api/v1/account/export/download` checks the current actor, ready state, and the database-clock 24-hour expiry before opening the object. It streams an authenticated bounded read with `Cache-Control: no-store`. It does not disclose an object key, redirect, or signed URL.
- Each scheduled run starts a bounded cleanup and a build on separate Hyperdrive connections. Cleanup is scheduled independently so a stalled build does not consume its chance to reconcile retention work.
- The builder writes one stored ZIP containing `data.ndjson`. The manifest's `selectionCutoffAt` is a selection cutoff captured when the lease is claimed. It is not an atomic historical MVCC snapshot. Each whitelisted query applies that cutoff independently, and no database transaction spans R2 I/O.

## Archive contents and limits

The archive includes approved account profile fields, owner posts and revisions, owner private tomorrow notes, and messages sent by the owner. It excludes received message bodies and previews, credentials, Better Auth sessions, provider tokens, push tokens, logs, keys, and signed URLs. Legitimate owned text remains unchanged even when it contains a URL.

The current `post_media` schema does not identify an R2 object key. Attachment references can appear in revision metadata, but owned upload bytes are still absent. Do not claim that attachment bytes export until a reviewed object relationship exists.

## Multipart cleanup

A lease-fenced cleanup tombstone exists before multipart creation. The worker records a returned multipart ID before uploading parts. If the create response is lost, cleanup lists multipart uploads for the exact fenced key and aborts them. Cleanup aborts known and listed uploads before removing the object. Failed aborts or deletes remain retryable. Successful reconciliation retains the tombstone for later passes, which catches a delayed completion instead of forgetting an untracked object.

R2 completion responses are bounded XML. A HTTP 200 response containing an XML error or malformed completion result fails the build. Worker errors do not expose provider bodies, keys, or credentials.

## Remaining work

This does not complete the whole export feature. Better Auth source canaries, browser and native user journeys, and owned-upload byte export remain separate work. Keep the feature disabled until those reviews and fault-injected R2 and two-connection PostgreSQL tests are complete.
