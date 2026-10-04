---
title: Troubleshooting
description: Diagnose deployed Dayli web, API, database, media, and messaging failures without bypassing controls or leaking user data.
---

# Troubleshooting

Troubleshooting is the process of locating the first boundary where expected behavior changed. In a distributed application, the visible symptom is often one layer away from the cause. A spinner in the browser may come from a stale web bundle, an API `503`, a database mismatch, or a storage timeout.

Start narrow. Record one sanitized request outcome, identify its layer, compare it with the release workflow, then use the owning check. Avoid the tempting fix of changing several systems at once. It makes recovery harder and erases the evidence that would have explained the problem.

All live staging operations go through approved protected workflows. Do not copy credentials into a shell, disable origin or rate-limit checks, edit the migration ledger, or make a private bucket public to see whether the error goes away.

## Safe first response

Before changing anything:

1. Record UTC time, environment, browser or client class, visible symptom, and the intended release commit if known.
2. Decide whether the issue is local or deployed. A local failure is not evidence that staging is down, and a passing local test is not staging proof.
3. In browser developer tools, capture only method, path without query, status, response content type, and duration. Do not record bodies, cookies, authorization headers, signed URLs, reset links, socket ticket queries, or private IDs.
4. Find the matching **Deploy coordinated staging release** run. Read the capture, migration, API proof, web build, and web deploy steps separately.
5. Check whether a newer release or configuration change occurred after the reported result.
6. Reproduce with an approved synthetic account and content only. Never use a personal account or real conversation as a test fixture.

A request ID can be useful inside access-controlled provider tooling, but do not publish it with private request details. Keep screenshots out of the default evidence path because they often contain account names, URLs, or content.

## Find the failing layer

| Symptom | Likely layer | First safe check |
| --- | --- | --- |
| Site does not load | DNS, TLS, web Worker, or assets | Check the web deployment job and a public navigation status |
| Page loads but every API call fails | Compiled API origin, proxy mode, API Worker, or ingress limit | Inspect one method, path, and status, then compare captured release mode |
| Sign-in loops or callback fails | Cookie origin, trusted origins, provider callback, or stale bundle | Run the protected auth smoke or use its allowlisted category |
| API returns `503` broadly | Rate-limit binding, Hyperdrive, auth tuple, or provider dependency | Check fixed operational category and release step, not response bodies |
| API reports missing table or column | Schema and code revision mismatch | Inspect migration plan, verification, and release SHA |
| Upload reserves but `PUT` fails | Signed request, expiry, R2 CORS, or object collision | Compare method, declared type, size, required header names, status, and age |
| Messages save but live updates do not arrive | Realtime binding, ticket, socket origin, or outbox delivery | Confirm REST state first, then inspect sanitized outbox age and socket phase |
| Realtime works but push does not | Push configuration, device registration, FCM, or APNs | Check configuration names and provider category, never the token or payload |

Work down the table one boundary at a time. A database query is not the first diagnostic for a missing stylesheet.

## Web and release failures

The web application is built with public origins and proxy mode compiled into its bundle. `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_WEB_API_BASE_URL`, and `NEXT_PUBLIC_WEB_API_PROXY_ENABLED` do not change when somebody edits a GitHub variable after deployment.

If a browser uses an old origin or mode:

1. Check the release capture for the commit and proxy mode.
2. Confirm the API stage succeeded before the web build began.
3. Confirm the web job built the same commit and captured mode.
4. Check whether the web deploy failed after a successful API deploy. That leaves a split release.
5. Start a reviewed coordinated release after correcting the protected source. Do not patch only the web Worker.
6. Test in a fresh browser context. A proxy-mode change moves the host-only cookie and can require sign-in again.

A browser cache can retain old assets, but do not diagnose every mismatch as cache. First compare the bundle's release workflow with the API release. Avoid asking users to clear all site data until the team understands whether session loss is acceptable.

For a docs-only problem, inspect **Deploy docs**. Documentation deploys through `docs-production` and is independent of the application release.

## API and authentication failures

The public health route is intentionally lighter than authenticated application routes. A healthy `/api/v1/health` response does not prove Better Auth, Hyperdrive-backed operations, R2, messaging, or providers work.

Use status and safe error code to narrow the path:

- `401` usually means no current valid session reached a protected operation.
- `403` can mean an untrusted unsafe browser origin or a known denied action.
- `404` can intentionally conceal a hidden, blocked, detached, inactive, or unknown resource.
- `429` means a healthy rate-limit bucket was exhausted. Respect `Retry-After`.
- `503` can mean a required dependency or rate-limit backend is unavailable.

Do not weaken these distinctions to debug them. In particular, do not add wildcard CORS, forward a client-selected actor ID, remove the `CF-Worker` rejection, or treat limiter failures as allowed traffic.

For browser sign-in trouble, check exact web and API origins, active proxy mode, Google callback for that mode, and the complete provider tuple. Cookies are host-only and do not move between API and web origins. Use the protected [authentication synthetic](/docs/development/testing/synthetic-testing) and its fixed categories. Do not enable screenshots, traces, HAR, console dumps, or raw Playwright errors in a credentialed run.

Authentication-specific recovery is in [Authentication setup and operations](/docs/systems/accounts-and-authentication/setup-and-operations).

## Database and migration failures

A schema error can come from old code using a new schema, new code using an old schema, a wrong target, or an incomplete migration. Guessing which one happened is risky.

1. Stop the release at the failed gate.
2. Inspect the target verification, `db:plan`, apply, and `db:verify` steps.
3. Compare the selected release SHA with the ordered migration names and hashes in the sanitized evidence.
4. If apply started, assume state may have changed until an approved read-only verifier establishes the ledger.
5. Prepare a reviewed forward fix or reconciliation. Follow [Database migrations](/docs/operations/database-migrations).

Do not connect from a local terminal with live credentials. Do not rerun blindly, edit `drizzle.__drizzle_migrations`, rewrite an applied SQL file, use an owner connection to bypass grants, or reset staging.

A successful ledger verification checks migration names and hashes, not every table or row. The local disposable PostgreSQL suite and deployed Hyperdrive proof cover different questions.

## Media upload and download failures

Media upload has three independent operations: reserve through the API, upload directly to private R2, then complete through the API. A post or avatar can attach the object only after completion validates it.

| Result | Meaning and next check |
| --- | --- |
| Reservation `503` | Check that all four R2 setting names and bindings are present through the release inventory |
| Browser preflight fails | Check exact bucket CORS origin and the allowed `content-type`, `content-length`, and `if-none-match` headers |
| R2 `PUT` returns `403` | Compare method, content type, byte count, required header names, and URL age with the reservation response |
| R2 `PUT` returns `412` | The write-once object already exists, continue to completion rather than overwriting it |
| Completion remains pending | Confirm the upload finished before completion and has not expired |
| Completion `503` | Treat storage failure as retryable, not invalid content |
| Post reports media not ready | Wait until every reservation is validated |
| Media fails after several minutes | Ask the authorized refresh endpoint for a new short-lived URL |

Never paste a presigned URL into logs or an issue. Its query is a temporary bearer credential. Record only the phase, status, content type category, declared byte size category, and approximate age.

Current limits are up to three photos or one video, no photo and video mix, 10 MB per visual item, 25 MB across a post, and 15 seconds for video. A voice memo can be up to 2 MB and 60 seconds. The signed upload URL and reservation expire after 15 minutes. Authenticated post media URLs expire after five minutes. Avatar signed URLs use ten minutes. Check current API responses and system docs before treating an older client message as authoritative.

For parser, public route, and cleanup details, read [Media uploads and storage](/docs/systems/media-uploads-and-storage) and its [setup and verification guide](/docs/systems/media-uploads-and-storage/setup-and-verification).

## Messaging and realtime failures

PostgreSQL is the durable source for messages. WebSocket notifications contain no message body and only tell clients to fetch current state. This gives a useful diagnostic rule: prove the REST result before debugging live delivery.

If send fails, check authentication, username setup, relationship or block policy, message validation, and database availability. If send succeeds but another screen stays stale:

1. Refresh through REST. If the message appears, storage worked.
2. Check ticket issuance and expiry, exact browser origin, direct API WSS destination, and the `USER_REALTIME` binding.
3. Inspect fixed delivery categories and aggregate outbox age or failed-job count. Do not inspect text, conversation IDs, socket ticket queries, or provider response bodies.
4. Reconnect. The client should list changes after its last applied sequence, fetch current projections, apply them, then advance its cursor.
5. Expect duplicate event IDs because delivery is at least once. Deduplicate instead of treating a duplicate notification as a duplicate stored message.

Outbox retries use leases and capped backoff. Blindly replaying jobs can create extra notifications even though message sends use `clientMessageId` for idempotency. Let the reviewed dispatcher and repair schedule own retries.

Push is a separate channel. Realtime can work while push is unconfigured or failing. The observed staging inventory on 4 October 2026 lacked both FCM and push-token encryption secret names, so do not claim push is enabled from code presence. Never log device tokens or message text. Dayli's intended notification is generic and contains only event and conversation identifiers.

See [Messaging setup and verification](/docs/systems/messaging/setup-and-verification) for socket, outbox, push, and device checks.

## Synthetic smoke failures

The staging authentication smoke reports an allowlisted category such as `credentials_missing`, `return_path_lost`, `login_failed`, `session_cookie_missing`, `session_cookie_attributes`, `logout_failed`, `unexpected_host`, or `cleanup_failed`.

Use the category to choose the layer. A manual dispatch reports no triggering release revision, while a post-release run can report the captured release and automation revisions. Neither proves which revision was still deployed when the browser started.

Reproduce runner logic locally with:

```bash
pnpm test:staging-auth-smoke-contract
```

That command uses fixtures and does not contact staging. Rerun the live journey only through the protected workflow. If the category is too broad, add a new fixed non-sensitive category and a negative privacy test. Do not expose the underlying browser error as a shortcut.

## Escalation record

Escalate when the symptom suggests unauthorized access, leaked credentials, incorrect data changes, repeated unexplained migration failure, or provider compromise. Follow [Security operations](/docs/operations/security) for containment.

A useful handoff contains:

- UTC window and environment;
- release and workflow run when known;
- symptom and allowlisted category;
- method and path template without query;
- status and affected component;
- checks already run and their evidence boundary;
- changes made through approved controls;
- remaining uncertainty.

Leave out user content, credentials, tokens, signed URLs, raw headers, database rows, and full provider errors. The next maintainer needs a map, not a suitcase full of sensitive data.

## Current limits

This guide does not assert current staging health, automatic smoke activation, provider availability, or production deployment. It provides safe decision paths based on the repository and fetched `origin/main` observed on 4 October 2026. Confirm live state through approved workflow metadata and focused checks.
