# Self-service data export backend contract

Issue #162 backend slice, based on the legal acceptance branch. This is draft-only work. The export worker and cleanup dispatcher are deliberately not registered in `apps/api/src/index.ts`, and no production binding, deployment, object-store setting, or lifecycle activation is changed here.

## Implemented backend surface

- `POST`, `GET`, and `DELETE /api/v1/account/export` are authenticated account-management routes. The account-policy capability is `export`, so Terms and age gates permit export while `pending_deletion` does too. `purging` and `purge_failed` fail closed.
- One active request is enforced by the existing partial unique index. Concurrent request replay returns the active request. Cancellation is limited to pre-publication `requested` and `building` work. A ready archive is left to its expiry cleanup path rather than risking an orphaned private object.
- `GET /api/v1/account/export/download` rechecks the current actor, ready state, and database-clock expiry immediately before reading the object. It streams bounded authenticated R2 range reads, has `Cache-Control: no-store`, a fixed attachment disposition, and never returns an object key, redirect, or presigned URL.
- `export-worker.ts` defines the offline, bounded multipart archive builder. It emits a versioned stored ZIP with an NDJSON entry, caps archive bytes and parts, aborts failed multipart uploads, and deletes a completed object if claim-bound publication reports a lifecycle generation race. It is an injectable offline component, not active scheduled work.

## Archive contract for the worker integration

The worker source must yield only these whitelist projections: account profile fields approved for export, owner posts and revisions, owner private tomorrow notes, attached upload bytes where the current post-media schema can identify them, and messages where `messages.sender_participant_id` is the actor's stable participant. Never join a replied-to message body or preview. Do not emit received bodies, peers' posts, credentials, Better Auth sessions, provider account tokens, push tokens, logs, generated signed URLs, or purged/revoked rows. Legitimate owned text is retained verbatim, including text that happens to contain a URL.

Current `post_media` records contain no native R2 object key. This backend therefore does not claim attached-upload byte export until #190 supplies a reviewed attachment object relationship. Legacy Cloudinary URLs are provenance metadata and are not serving grants.

## Required next slice

A reviewed restricted-role procedure must implement `ExportBuildStore.claim`, `publish`, `fail`, expiry transition, and durable cleanup-task delivery using the existing `data_export_object_cleanup_tasks` table. It must lock the lifecycle and export rows, compare lease token and lifecycle generation, enqueue cleanup before clearing a ready key, and make stale workers incapable of publishing or deleting another attempt's object. Register that dispatcher only behind an explicitly disabled rollout binding after Miniflare or faithful fault-injected R2 tests and two-connection PostgreSQL race tests exist.

Client follow-up #165 and #169 needs account-export status, request, cancellation, download affordance, native bearer coverage, browser CSRF behavior, and end-to-end archive parsing. Keep #162 open until those user journeys and the offline worker procedures are integrated.
