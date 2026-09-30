# Dayli data lifecycle implementation plan

Status: planning only. No application code, migration, provider setting, destructive job, deployment, purchase, commit, push, or pull request is authorized by this document.

Baseline inspected: worktree `docs/legal-policy-decisions` at `3a547ced3410a34793670880ee873f70b0abc449` (`3a547ce`). At inspection time, fetched `origin/main` was `7e88aedd0d7151fd81a4478f49d8a3306deb21a9`, two commits ahead. Do not rebase this worktree or overwrite its uncommitted legal frontend work while using this plan.

## Plain-English summary

Dayli needs a server-owned lifecycle system before public registration. Deleting an account must stop ordinary access and hide the profile, journal, shares, sockets, and push delivery at once. The user then has seven days to cancel. If they do not, Dayli starts irreversible cleanup and finishes removal from active systems within the following seven days. A sent message stays visible to the other participant under the label `Deleted account`; it is not anonymous and may still identify its author. The conversation is removed when its last participant is permanently deleted and both cancellation windows have ended.

Users must be able to download their own data before launch. A completed archive lasts 24 hours. It must not include received message text, secrets, unauthorized data, or received text copied into reply previews. A user pending account deletion can still verify their identity, download data, cancel deletion, read the policies, and sign out. Downloading data does not stop or delay deletion.

Individual posts get a seven-day Trash period, followed by at most seven days for cleanup. Routine Dayli-controlled diagnostic and security logs last no more than 30 days, preferably less. Unreferenced server uploads are eligible for cleanup after seven days if uploads are ever connected to clients. This work must not introduce upload-on-select or background draft uploads.

Dayli will not automatically delete inactive accounts. The owner probably will not add backups while the service is starting. Initial work must only inventory recovery already supplied by Neon and Cloudflare R2, record the risk of permanent loss, and leave provider safeguards unchanged. No cost research or spending is approved.

No automatic destruction may run until synthetic tests, report-only runs, deadline monitoring, rollback of the application release, and explicit operator deployment approval are complete. Production execution must default to off.

## Product decisions, recommended engineering defaults, and legal questions

### Owner-approved product rules

These rules are fixed inputs to implementation:

- Public registration may open only after launch safeguards are ready.
- There is no automatic inactivity deletion.
- Web and Flutter Settings provide verified Delete account and Download my data flows.
- A verified deletion request immediately blocks normal account use and hides the profile, journals, and sharing.
- Cancellation is allowed for exactly seven days. Irreversible cleanup starts after that deadline and active-system cleanup finishes no later than 14 days after the verified request.
- Cancellation restores eligible share links that were valid before the request and remain allowed by current permissions. It never restores an independently revoked link or a deleted post.
- Sent messages remain for a surviving recipient and show `Deleted account`. This is retention, not anonymization. Delete the conversation and its data when the last participant is permanently deleted and all relevant cancellation windows have ended.
- Export includes the requester's account and profile, journals, revisions, private notes, retained uploads, and retained messages authored by that user. It excludes received message bodies, credentials, tokens, internal security logs, and purged data.
- Export authorization must prevent leaks through reply previews, shared data, blocks, or stale permissions. A pending-deletion user may export through the restricted account screen. Export never cancels or extends deletion.
- A ready archive expires after 24 hours. Cleanup removes it sooner when irreversible account purge starts.
- A deleted post is hidden immediately, stays restorable in Trash for seven days, then is cleaned up within seven more days.
- Abandoned server uploads, if any exist, are removed after seven days. Selection alone stays local to the device.
- Routine Dayli-controlled diagnostic and security records have a maximum 30-day lifetime. Keep them for less where practical. An incident exception needs a narrow reason, owner, review date, and later deletion.
- New email and Google registrations on web and mobile use an unchecked Terms control. The server records user ID, accepted version, and acceptance time. The Privacy Policy is a separate notice.
- Existing users must accept the first approved Terms on their next visit before normal use. They can still read policies, sign out, and request deletion. Never infer or backfill acceptance.
- Material Terms changes normally get 30 days' in-app and email notice and require acceptance of the new version. Explain any shorter urgent legal or security change.
- Users declare that they are at least 16. Do not collect a birthday or identity document by default.
- A credible underage report gets human review before any warranted restriction. Raw reports never cause automatic suspension. A restricted person gets an appeal path.
- The owner handles privacy, support, and incidents. A backup person must be named before launch.
- Draft from New Zealand law while preserving mandatory overseas rights, subject to legal review.
- The current operator wording is `agroupforcoders`, an informal group, with `agroupforcoders@gmail.com`. Final responsible-party identification still needs review.
- Dayli does not use personal content for research or AI training.
- Sydney or Southeast Asia storage and Cloudflare analytics remain unverified claims.

### Recommended engineering defaults

These defaults make the design implementable. They are not new legal promises:

1. Use PostgreSQL's database clock and `TIMESTAMPTZ` for every lifecycle boundary. Cancellation or Trash restoration is allowed only while `database_now < restore_until`. A job becomes eligible when `database_now >= restore_until`.
2. Give each deletion request an immutable request ID and generation. State-changing commands lock the lifecycle row and use compare-and-set transitions. Retries return the existing result.
3. Use states `active`, `pending_deletion`, `purging`, and `purge_failed` while the user row exists. Represent successful completion with a separate content-free purge receipt after removing the user and lifecycle row. Do not keep a deleted profile to make audit reporting easier.
4. Gate normal access in one server policy used by every protected route, socket ticket, socket publish, push dispatch, public/profile lookup, feed/detail lookup, and future share-link route. Client routing is only a user experience layer, not enforcement.
5. Keep Better Auth as the identity authority. Add short-lived, single-use account-management grants for destructive requests and cancellation. Bind a grant to user, session, action, expiry, and a stored token hash.
6. Password accounts reauthenticate with the current password. A Google-only account repeats Google authentication and must return the already-linked Google subject. An account with both methods may use either. Do not request ID documents.
7. After accepting account deletion, revoke every ordinary session and realtime ticket, close sockets, remove push registrations, cancel unsent delivery work, and require a fresh sign-in for the restricted account-management screen. A Better Auth session for a pending account is not sufficient for normal API access.
8. Do not mutate every share link merely to hide an account. Make share authorization depend on current account and post lifecycle state. Cancellation then reveals only links that remain independently active and permitted.
9. Use the existing API Worker's scheduled handler for coordination at first, but give cleanup a separate, narrowly privileged database binding and narrowly scoped R2 delete credentials. Do not put the migrator credential in request handling or call a generic migrator connection for every job.
10. Use a deployment mode with `disabled`, `report_only`, and `execute`. Missing or invalid configuration resolves to `disabled`. Changing to `execute` requires an operator-approved manual deployment.
11. Aim to complete ordinary cleanup within 24 hours after it becomes eligible, leaving the remaining time as a failure margin. Zero items may pass the owner-approved 14-day account or post deadline without an alert and incident record.
12. Treat R2 and PostgreSQL as separate systems. Persist a bounded cleanup manifest, delete objects idempotently, and checkpoint each step. An R2 `not found` response counts as already deleted. Never claim a cross-provider transaction.
13. Let an account deletion dominate a post Trash schedule. It does not extend either account deadline. Cancelling account deletion restores only posts that were not already in Trash before the request.
14. Allow an existing user who has not accepted current Terms to export as a recommended privacy-safe exception alongside policy reading, sign-out, and deletion. Confirm this with legal review before contracts are frozen.
15. Require existing users to make the same 16+ declaration before normal use, using the same restricted shell as Terms acceptance. This closes an obvious bypass, but the legal reviewer must confirm the treatment of existing users aged under 16.

### Legal and owner questions that remain open

Do not block technical planning on these questions, but do not publish final promises or enable public registration until the relevant owner resolves them:

- Who is the legally responsible operator, who is the backup privacy contact, and who gives final publication and incident decisions?
- What human process applies after credible evidence that a user is under 16, including appeal, safeguarding, and eventual deletion?
- Are any narrow retention duties required by law? No generic legal hold or indefinite exception is approved. Model a specific exception only after legal advice names its purpose, data, access, review date, and end condition.
- Does the selected New Zealand governing-law wording work for worldwide users and users aged 16 or 17 while preserving mandatory overseas rights?
- Do Apple and Google app distribution rules impose interface or timing details for deletion and export? Verify current rules rather than claiming compliance from this plan.
- What exact Neon region, R2 location behavior, Cloudflare analytics/logging, and provider recovery periods apply to each environment?
- Does Better Auth 1.7.5 expose a safe hook for atomic registration-intent consumption across email and Google creation? If not, use an app-owned wrapper and fail-closed onboarding state rather than weakening the acceptance record.

## Current architecture findings

The plan is based on the checked-out `3a547ce` tree, not on an assumed future main branch.

- `apps/api/src/app.ts` composes Hono actions over Better Auth and a restricted Hyperdrive `app` role. It registers system, media, posting day, post, relationship, messaging, realtime, push, and username routes. Lifecycle gating must cover all of them and the Better Auth wrapper in `apps/api/src/features/auth/route.ts`.
- `apps/api/src/index.ts` already has a Cloudflare scheduled handler for messaging delivery. `apps/api/wrangler.jsonc` runs it every minute. Lifecycle work can share scheduling, but must have separate claims, limits, permissions, feature flags, and alerts so it cannot starve messaging repair.
- `packages/db/admin/bootstrap-roles.sql` separates `app` from `migrator`, but `packages/db/admin/bootstrap-migrator.sql` grants broad table writes to `app`. Lifecycle work needs reviewed grants and a dedicated role or security-definer procedures. The ordinary API must not receive broad migration powers.
- Better Auth stores users, provider accounts, sessions, verifications, and rate limits. Web uses cookies. Flutter uses signed bearer tokens in protected storage. `SessionController` already clears sockets, messaging caches, and push state around account changes, which is a useful integration point but not a server-side gate.
- Posts, tomorrow notes, immutable revisions, post media metadata, and idempotency keys already exist. Post, revision, media, and tomorrow-note foreign keys mostly use `NO ACTION`. Revision and media triggers permit physical deletion only to `migrator`. The cleanup design must replace this hard-coded role exception with a narrow lifecycle path.
- `post_media` IDs and ownership are immutable because revisions contain media metadata. A post purge must delete revisions and legacy media before post-media rows and the post. It must also delete the backing object only after proving no live reference remains.
- Media reservation APIs and R2 validation exist, but clients do not call them and no post attachment linkage exists. Abandoned-object cleanup is still needed for failed or interrupted direct uploads. It must not create background uploads.
- Messaging is implemented. Current messaging foreign keys cascade from `user`, including conversations, messages, outbox rows, tickets, and devices. Deleting a user as the schema stands would erase recipient history, which contradicts the approved rule. Messaging identity must be decoupled before account deletion can execute.
- Message replies project current parent text. Exports must remove received parent text from previews. Push and sockets already use content-free invalidations or generic notifications, which should remain true for lifecycle notifications.
- Shared-link behavior is documented in `docs/dayli/product-decisions.md`, but no share-link table or route exists on this baseline. Build lifecycle-compatible authorization when that feature is implemented. Do not add speculative share storage solely for deletion.
- `apps/web` has both `next build` and a vinext deployment build. `legal:release:check` combines document parity and approval checks. Ordinary CI runs `legal:check`, so PR and local builds can review drafts, while the staging web publication workflow runs `legal:release:check` before building or deploying and therefore fails closed for the current drafts. Root `pnpm build` reaches ordinary `next build`. Flutter builds have no equivalent publication gate. GitHub #167 must wire the release check into every future production web and app-store delivery path.
- The draft legal frontend and shared legal content are uncommitted changes in this worktree. They show and link draft documents but do not record acceptance or change backend semantics.
- `docs/dayli/security.md` and `docs/dayli/product-decisions.md` still contain older 30-day backup and recovery-target language. This task does not edit them. A later documentation reconciliation must replace those claims with verified provider behavior and the latest owner posture before publication.

## Target data and state design

### Account lifecycle

Add an app-owned lifecycle record keyed by user while the user exists:

- `user_id`
- `state`
- `request_id`
- `generation`
- `requested_at`
- `cancel_until`
- `purge_due_at`
- `purge_started_at`
- `last_error_category`
- `next_attempt_at`
- `lease_token` and `lease_expires_at`
- timestamps

Create the request in one database transaction using database time. Set `cancel_until = requested_at + interval '7 days'` and `purge_due_at = requested_at + interval '14 days'`. A repeated request with the same idempotency key returns the same request. A different request while pending returns the current lifecycle state.

Keep a separate purge receipt after deleting the user. It should contain request ID, a keyed non-reversible subject digest, request and completion times, final outcome, policy version, and coarse category counts. It must not contain email, username, post text, message text, object URLs, access tokens, or a reversible provider ID. Define and approve a short receipt retention period before execution. Do not invent one in code.

At request acceptance:

1. Lock the lifecycle row and verify the account is active.
2. Insert the pending state and deadline values.
3. Record which posts were active versus already in Trash, only as IDs and states needed for cancellation.
4. Commit the lifecycle transition.
5. Revoke sessions, realtime tickets, sockets, push devices, and queued peer notifications through idempotent follow-up work. API and read policies already deny access based on pending state, so a provider failure cannot leave normal access open.
6. Send a content-free confirmation containing deadlines and account-management navigation. Do not put journal or message content in the notice.

Cancellation locks the row and succeeds only when state is `pending_deletion` and database time is before `cancel_until`. It increments generation so stale workers cannot act. It creates fresh ordinary sessions only after current Terms, age, and other active restrictions pass. Current visibility checks reveal eligible posts and links again. Posts already in Trash, links independently revoked, expired permissions, blocks, and privacy changes remain in force.

The worker claims a request only when `now >= cancel_until`, state and generation still match, and no live lease exists. The first irreversible action atomically changes state to `purging`. From this point cancellation returns a final, generic unavailable result.

### Constrained account-management access

Use ordinary Better Auth only to establish identity, then apply server lifecycle policy:

- `active` accounts can use normal routes if their Terms, age, username, and other gates pass.
- `pending_deletion` accounts can call only lifecycle status, cancellation challenge and confirmation, export request/status/download, policy reads where server involvement exists, and sign-out.
- `purging`, `purge_failed`, and `purged` accounts cannot create a usable session or management grant. Support handles an operational failure without restoring normal access.
- Terms-blocked and age-declaration-blocked accounts can read policies, sign out, request export under the recommended default, and request deletion.

A reauthentication endpoint verifies password or linked Google identity and returns a one-time account-management grant. Store only its hash. Keep it short-lived, suggested 10 minutes, and consume it for Delete account or cancellation. A request replay returns the recorded outcome without repeating side effects. Test browser cookies, Flutter bearer sessions, password-only accounts, Google-only accounts, linked accounts, expired sessions, revoked sessions, and account switching.

Ordinary sign-in never cancels deletion. It only opens the restricted shell for a pending account.

### Messaging retention

Do not delete a `user` row against the current cascading messaging schema.

Recommended migration:

1. Add a `messaging_participants` table with a stable participant ID, nullable unique active `user_id`, and participant state. It contains no email or profile fields.
2. Move direct-pair, membership, message sender, reaction actor, and change-member references from `user` to participant identity through additive columns and backfill.
3. Keep realtime outbox recipients, socket tickets, and push devices tied to active users because delivery must stop on deletion.
4. Enforce the direct-pair uniqueness and transaction lock using participant IDs after migration.
5. On permanent user purge, set that participant's `user_id` to null and state to `deleted`. Projections return the fixed label `Deleted account`; they never fetch the old profile.
6. Retain the message body, sequence, tombstones, reactions from a surviving participant where product policy requires them, and enough conversation structure for that participant to read the thread. Do not describe this as anonymized.
7. Remove the deleted participant's reactions if the final contract treats reactions as profile-linked activity. Freeze this choice in the contract ticket before migration.
8. When both participants are deleted and both request generations have crossed cancellation into irreversible cleanup, enqueue conversation purge. Delete messages, reply links, reactions, changes, and retained participant rows in dependency order.
9. Exports select authored messages by active participant mapping and current conversation authorization. They never include a received parent body in a reply preview.

Migration tests must prove that deleting a user cannot cascade-delete a surviving recipient's conversation. They must also prove that the last-participant path removes the conversation.

### Post Trash and media

Add lifecycle fields or a one-to-one post deletion record with `trashed_at`, `restore_until`, `purge_due_at`, generation, and worker lease. Central post visibility must exclude Trash immediately from author detail, friends feed, future share links, exports requested after the trash transition where the product contract excludes trashed content, and every future preview.

Recommended export default: include still-restorable Trash items in a clearly marked `trash/` section because they remain the user's content. Confirm this in the export contract ticket. Never restore them merely because an archive was requested.

Restoration succeeds only before the exact UTC boundary and only for an active account. At account deletion request, active posts inherit account suppression, while posts already in Trash retain their original deadlines. Account purge removes all owned posts regardless of their Trash deadline and does not extend the account deadline.

For purge, remove tomorrow notes, revisions, idempotency rows, legacy media metadata, post-media rows, and the post in a controlled operation. Replace hard-coded `current_user = 'migrator'` trigger bypasses with narrowly granted lifecycle procedures or a dedicated role. Ordinary app writes must still be unable to delete immutable rows.

Before deleting an R2 object, resolve every live reference, including current post media, revision metadata, reservations, future share/download records, and export manifests. Use an explicit media-object/reference model before real attachments ship. Current reservation objects are abandoned-cleanup candidates only when they are at least seven days old, have no accepted reference, have no live completion/upload lease, and are not part of a retry in progress. Run a HEAD/list report first, then delete idempotently. Database row cleanup follows confirmed object deletion or records a retryable missing-object result.

### Export

Use an app-owned export request table with request ID, user ID, lifecycle generation, status, requested time, snapshot cutoff, object key, ready time, expiry, lease, and sanitized failure category.

1. Verify identity and current lifecycle permission. Rate-limit requests and allow one active request per user.
2. Capture a database cutoff and lifecycle generation. Build from a repeatable, authorization-aware snapshot. Do not hold a long transaction while writing R2.
3. Produce a versioned archive manifest and machine-readable JSON files. Escape spreadsheet-like values if CSV is ever added.
4. Include profile, Terms/age records, journals, immutable revisions, tomorrow/private notes, retained owned uploads, and authored retained message text that the requester may currently access.
5. Exclude password hashes, provider access and refresh tokens, sessions, verification tokens, signed URLs, internal logs, raw security cases, received bodies, other profiles beyond the minimum conversation label, and already-purged data.
6. For authored replies, include the requester's body and reply target identifier only. Omit the received message body and any copied preview.
7. Put the archive in a private R2 prefix separate from journal media. Encrypt in transit and rely on verified provider storage controls. Never log its key or download URL.
8. Mark it ready only after upload integrity succeeds. Generate a short-lived download URL after fresh ownership and lifecycle authorization. The archive object expires 24 hours after `ready_at`.
9. At account `purging`, atomically cancel queued export jobs and enqueue deletion of every ready archive before other content cleanup. A worker holding an old generation must stop before publishing an archive.
10. If export and deletion race, row locks and generation checks decide the outcome. An export accepted before purge may finish during `pending_deletion`; one not ready when `purging` begins is cancelled. No export extends `cancel_until` or `purge_due_at`.

Downloaded copies and device-held Flutter drafts cannot be recalled. State that plainly in user-facing text.

### Terms, Privacy notice, and age declaration

Version legal documents independently. Add immutable Terms versions and acceptance rows containing only user ID, Terms version, and server acceptance time. Add a separate age declaration record with declaration version and server time. Do not treat Privacy Policy display as consent.

Registration uses a short-lived server-issued intent. The intent records the currently presented Terms version and age declaration, uses an unchecked client control, and is bound to the registration transaction or OAuth state. Email sign-up and web/native Google creation must consume it once. Existing sign-in to an already-created account must not consume a registration intent.

Server middleware compares the current required Terms version with the user's acceptance. For a material future version, store notice start and effective times. Send a generic in-app/email notice normally 30 days before effect. Once effective, normal access is gated until explicit acceptance. An urgent version needs an operator-entered reason shown to users. Do not let an administrator label an ordinary change urgent without a recorded reason.

Check every bypass: direct Better Auth email endpoint, Google web callback, native Google ID-token route, password recovery followed by sign-in, existing sessions, web deep links, Flutter restored sessions, sockets, and generated REST clients.

### Underage evidence and restrictions

Do not automate suspension from user reports. Create a minimal support case only after the privacy owner judges the evidence credible enough to record. Store reporter contact only when needed, avoid copying journal or message content, restrict access, and assign a review date.

A human reviewer records `no_action` or `temporary_restriction` with a reason category. A temporary restriction uses the same central account gate, stops public/profile/journal visibility, sockets, push, and ordinary writes, and preserves policy, sign-out, appeal, and deletion access. Send a content-free notice with the appeal route. Final retention or deletion after review remains blocked on legal advice.

### Logs, audit evidence, and notifications

Inventory every Dayli-controlled log sink before changing retention: Worker observability, application `console` output, GitHub artifacts, provider dashboards, database job errors, web hosting logs, mobile crash tooling if introduced, Resend, FCM, and support records.

Application logs use request IDs, action names, outcome categories, counts, and latency. Never log message text, journal text, passwords, tokens, archive keys, presigned URLs, OAuth state, socket tickets, email addresses, or raw provider bodies. Routine records expire within 30 days, with a shorter target where each sink supports it.

An incident exception is an explicit record with incident ID, affected log category, reason, owner, created time, review date, and deletion decision. It does not silently copy content into a new store. Provider-controlled retention remains a verified disclosure, not an app guarantee.

Lifecycle notices cover request accepted, cancellation completed, export ready, archive expired, Terms notice, and restriction/appeal. Use generic subject and body text with dates and account-management links. Never include message or journal content. Delivery failure does not reopen access or extend a deadline.

### Provider copies and recovery

Inventory only. Record Neon point-in-time restore/history settings, branch retention, snapshots or exports, region, and deletion behavior. Record R2 versioning, object lifecycle rules, replication/location behavior, analytics/log retention, and whether deleted versions remain recoverable. Use provider consoles or owner-supplied evidence without reading credentials. Date each finding and distinguish configuration from a tested result.

Do not enable, disable, purchase, or price backup services in initial scope. Do not state that there are no backups merely because the owner has not created one.

If provider recovery exists, the restoration runbook must replay the durable deletion ledger and completed object manifests before restored data can serve traffic. Keep restored environments isolated until deleted accounts, posts, archives, sessions, push tokens, and objects are suppressed again. A restore must not resurrect deleted content. If no usable recovery exists, document the risk of permanent journal loss in operator and user-facing drafts after legal review.

## Prioritized implementation tickets

The tickets below are ordered for a small team. Launch-blocking tickets are P0. Do not combine the legal frontend PR with backend lifecycle semantics.

### P0-1: reconcile baseline, inventory, and contracts

Likely files:

- `docs/implementation/data-lifecycle-implementation-plan.md`
- `docs/implementation/legal-policy-decisions-handoff.md`
- later updates to `docs/dayli/product-decisions.md`, `docs/dayli/security.md`, `docs/dayli/architecture.md`, and provider evidence records

Dependencies: legal frontend integration decision.

Work:

- Merge or reapply the completed legal frontend through its own reviewed PR. Preserve the draft status and publication checks.
- Rebase future backend work on then-current main, not this dirty worktree.
- Inventory all data stores, providers, logs, routes, scheduled jobs, caches, device state, and delivery workflows. Include tables and triggers, R2 objects, Durable Object metadata, FCM/APNs tokens, Resend events, Hyperdrive, Cloudflare analytics, and local drafts.
- Record exact provider regions and recovery behavior as verified, unknown, or not applicable. Do not change settings.
- Freeze API state names, exact timestamps, message reaction treatment after sender deletion, Trash export inclusion, existing-user age handling, and the recommended export exception for unaccepted Terms.

Acceptance:

- Every owner decision in the handoff maps to a contract test or operator gate.
- Stale backup claims are listed for later correction and are absent from publishable copy.
- No credential value, private resource ID, or production data appears in the evidence.

### P0-2: schema and least-privilege lifecycle foundation

Likely files:

- `packages/db/src/schema/lifecycle.ts`
- `packages/db/src/schema/legal.ts`
- `packages/db/src/schema/index.ts`
- new additive files under `packages/db/migrations/`
- `packages/db/admin/bootstrap-roles.sql`
- `packages/db/admin/bootstrap-migrator.sql`
- focused integration tests under `packages/db/src/`

Dependencies: P0-1 contract freeze.

Work:

- Add lifecycle, management-grant, purge-receipt, export-request, legal-version, acceptance, age-declaration, and operator-case records.
- Add exact checks, indexes for due work, unique active-request rules, generation fencing, and bounded lease claims.
- Create a `lifecycle_worker` role or reviewed security-definer procedures with only the operations needed for cleanup. Keep migration ownership separate.
- Replace hard-coded migrator-only immutable-history deletion with the narrow lifecycle mechanism.
- Keep migrations additive and forward-only. Include review files and realistic lock/statement timeouts.

Acceptance:

- Restricted `app` cannot perform physical purge or bypass immutable history.
- Lifecycle worker can purge only an eligible, claimed subject through reviewed operations.
- Boundary, exact-deadline, concurrent cancel/claim, retry, and stale-generation tests pass in real PostgreSQL 18.

### P0-3: central account policy and constrained sessions

Likely files:

- `apps/api/src/http/middleware/`
- `apps/api/src/features/auth/{better-auth,route}.ts`
- `apps/api/src/features/account-lifecycle/`
- `apps/api/src/app.ts`
- `apps/api/src/infrastructure/realtime/`
- generated contracts and clients

Dependencies: P0-2.

Work:

- Build one account policy returning allowed capabilities for active, Terms-blocked, age-blocked, pending deletion, underage-restricted, and purging states.
- Apply it to every registered action, Better Auth sign-in/creation path, username setup, media, posts, relationships, messaging, realtime tickets/connect, push registration/dispatch, and future public/share projections.
- Add password and Google reauthentication with one-time action grants.
- Revoke sessions, sockets, push devices, tickets, and obsolete outbox work after deletion request. Keep API denial authoritative during partial provider failure.
- Return stable machine-readable restricted-state responses so web and Flutter can enter the correct shell.

Acceptance:

- A route inventory test fails when a protected action lacks account policy.
- Pending users cannot write, read ordinary private content, receive socket events, or receive push, but can use approved account-management actions.
- Sign-in never cancels deletion. Password-only, Google-only, and linked-account tests pass.

### P0-4: messaging identity decoupling

Likely files:

- `packages/db/src/schema/messaging.ts`
- additive messaging migrations and integration tests
- `apps/api/src/features/messaging/shared/`
- messaging action repositories and projections
- web and Flutter message projection tests

Dependencies: P0-1, P0-2. Must land before executable account purge.

Work:

- Add participant identity and backfill current users.
- Move conversation and sender dependencies away from cascading user foreign keys.
- Project `Deleted account` without retaining profile, credentials, or provider records.
- Stop delivery work for deleted users while preserving readable history for a surviving participant.
- Enqueue and perform last-participant conversation cleanup only after both cancellation windows have irreversibly ended.
- Strip received reply text from exports.

Acceptance:

- Purging Alice removes Alice's auth/profile/journal data while Bob still reads Alice's retained sent text under `Deleted account`.
- Message text remains acknowledged as identifying, not anonymized.
- Purging Bob later removes the entire conversation and delivery/change descendants.
- Existing block, tombstone, edit, reaction, pagination, outbox, and concurrency tests remain green.

### P0-5: account deletion request, cancellation, and purge orchestration

Likely files:

- `apps/api/src/features/account-lifecycle/{request-deletion,cancel-deletion,get-status}/`
- `apps/api/src/infrastructure/jobs/account-lifecycle/`
- `apps/api/src/index.ts`
- `apps/api/src/env.ts`
- `apps/api/wrangler*.jsonc`
- `scripts/staging-worker-config.mjs`
- `.github/workflows/staging-hyperdrive.yml`

Dependencies: P0-3 and P0-4.

Work:

- Implement idempotent request and cancellation transitions with database time and row locks.
- Build staged, resumable cleanup for exports, R2 objects, posts and private notes, relationships, provider accounts, sessions, profile, and user records. Preserve recipient messages as specified.
- Add independent bounded queues or claim types so lifecycle work cannot starve the messaging outbox.
- Add `disabled`, `report_only`, and `execute` modes. Default to `disabled` in every example and missing configuration.
- Add stop controls, lease fencing, sanitized failure categories, and operator rerun commands that address request IDs rather than user content.

Acceptance:

- Synthetic two-user tests cover request, immediate hiding, exact boundary, cancellation, stale job cancellation, partial R2 failure, worker crash after each checkpoint, duplicate dispatch, and final receipt.
- No automatic production purge can run from a normal code merge or CI run.
- A manual protected deployment and recorded operator approval are required to select `execute`.

### P0-6: self-service export

Likely files:

- `apps/api/src/features/data-export/`
- `apps/api/src/infrastructure/jobs/data-export/`
- `apps/api/src/infrastructure/media/`
- `packages/contracts/openapi.json` and generated clients
- web and Flutter Settings/account-management screens

Dependencies: P0-3, P0-4, lifecycle schema from P0-2.

Work:

- Implement request, status, authenticated download, expiry, and cancellation-on-purge.
- Build a versioned archive and manifest from an authorization-aware cutoff.
- Add object cleanup at 24 hours and at purge start.
- Add request quotas and bounded archive size/time behavior. Large exports should page internally and fail safely rather than load all content into Worker memory.

Acceptance:

- Fixture canaries prove received messages, received reply previews, another user's posts, passwords, provider tokens, sessions, logs, signed URLs, and revoked content never appear.
- Pending-deletion export works without changing either deletion deadline.
- An export/purge race cannot publish an archive after `purging` starts.
- Expired and purged archive URLs fail even if a stale client retains the URL.

### P0-7: post Trash and abandoned-upload cleanup

Likely files:

- post lifecycle additions in `packages/db`
- `apps/api/src/features/posts/{move-to-trash,restore-post,purge-post}/`
- `apps/api/src/infrastructure/jobs/media-cleanup/`
- post permission filters and clients
- web and Flutter journal/Trash screens

Dependencies: P0-2 and centralized permission policy. Media-object references depend on actual attachment integration.

Work:

- Add Trash/restore endpoints and visibility filtering.
- Add exact seven-day restoration and 14-day cleanup deadlines.
- Implement dependency-ordered post cleanup through the narrow lifecycle role.
- Add report-only abandoned reservation/object discovery after seven days. Protect active upload/completion retries.
- Do not add upload-on-select, draft upload, or background upload behavior.

Acceptance:

- Trash hides a post from author detail, feed, profiles, and future shares immediately.
- Restore before, at, and after the exact boundary behaves as specified.
- Account deletion dominates Trash without extending account deadlines.
- Shared or still-referenced media is not deleted. Unreferenced object deletion is retryable across R2 and PostgreSQL failures.

### P0-8: Terms acceptance, notice versioning, and age declaration

Likely files:

- `packages/legal-content/`
- `apps/api/src/features/legal/`
- Better Auth wrapper and database hooks
- `apps/web/app/(auth)/`, session provider and main layout
- `apps/mobile/lib/auth/`, router and restricted screens
- legal synchronization and publication scripts

Dependencies: P0-1, P0-2, P0-3.

Work:

- Add server-owned current document versions and registration intents.
- Require unchecked Terms and 16+ controls before email or Google account creation across web and mobile.
- Record server user ID, Terms version, and server time. Record age declaration separately.
- Gate existing users on next visit without inferring prior acceptance.
- Model ordinary 30-day material-change notice and explained urgent changes.
- Preserve policy, sign-out, deletion, and approved export paths while gated.

Acceptance:

- Direct endpoint and callback bypass tests cover email, Google web, Google native, restored sessions, password reset, and concurrent registration retries.
- No account reaches normal use without current acceptance and age declaration.
- Privacy notice display is not stored as broad consent.
- Minor non-material wording changes can publish without falsely creating acceptance records; material changes cannot.

### P0-9: web and Flutter lifecycle experiences

Likely files:

- `apps/web/app/(main)/settings/`
- a web restricted account-management route outside the normal main gate
- `apps/web/lib/session/`
- `apps/mobile/lib/settings/`
- `apps/mobile/lib/app/router.dart`
- `apps/mobile/lib/auth/session_controller.dart`
- focused web and Flutter tests

Dependencies: API contracts from P0-3, P0-5, P0-6, P0-7, P0-8.

Work:

- Add reauthentication, explicit destructive confirmation, exact dates, cancellation, export status/download, Trash, and restricted-state routing.
- Explain retained recipient messages and the `Deleted account` label before confirmation.
- Clear private query caches, sockets, push state, and local session material after deletion request. Explain that downloaded archives and offline drafts cannot be recalled.
- Keep policy pages reachable without session restoration and while restricted.

Acceptance:

- Web and Flutter parity tests cover password and Google accounts, offline/error states, restart during pending deletion, account switching, cancellation, and inaccessible normal routes.
- The UI never claims purge is complete from request acceptance alone.
- App-store review builds expose the deletion entry point without requiring a browser-only detour, subject to current store-rule verification.

### P0-10: logs, incident review, support operations, and alerts

Likely files:

- infrastructure logging helpers under `apps/api/src/infrastructure/`
- lifecycle job metrics and runbooks under `docs/implementation/`
- Cloudflare deployment configuration after provider verification

Dependencies: lifecycle jobs and provider inventory.

Work:

- Add structured, content-free lifecycle metrics and alerts.
- Configure app-controlled routine retention to at most 30 days where supported.
- Add reviewed incident exception records and expiry reminders.
- Create operator runbooks for failed cleanup, missed deadline, export leak suspicion, underage evidence, appeal, provider outage, and restore suppression.
- Nominate and train a backup privacy/support person before launch.

Recommended alert thresholds:

- warning when an eligible purge remains incomplete for 24 hours;
- urgent at six hours before `purge_due_at`;
- immediate incident at or after `purge_due_at`;
- warning after three consecutive cross-provider failures or a one-hour export stall;
- alert on any queue whose oldest eligible item exceeds one hour;
- alert when report-only discovery finds content that execution rules would not classify deterministically.

Acceptance:

- Canary content does not appear in logs, traces, metrics, alerts, artifacts, or provider error records.
- An operator can find a failed request by opaque request ID, stop execution, retry one safe stage, and verify completion without querying user content.
- Every incident exception has a review date and deletion outcome.

### P0-11: delivery-path and publication gates

Likely files:

- root `package.json`
- `apps/web/package.json`
- `.github/workflows/ci.yml`
- `.github/workflows/staging-web.yml`
- future production web and mobile release workflows
- `scripts/sync-legal-content.mjs` or focused wrapper scripts

Dependencies: legal versioning and final release process.

Work:

- Keep draft checks in normal CI without requiring an effective date.
- Require publish checks for every release build: ordinary Next build if deployable, vinext, Android release, iOS archive, and any static export.
- Check shared legal JSON and bundled Flutter copies, status, effective date, document version, required acceptance version, and deployment environment agreement.
- Keep frontend legal integration separate from backend activation. Static pages may merge while acceptance and deletion remain disabled and described as unavailable.

Acceptance:

- A release candidate with draft documents, missing dates, mismatched mobile copies, or server-required version drift fails before deployment.
- Development and PR builds can still test drafts.
- The team documents which workflow is authoritative for each public channel.

### P0-12: human underage review and appeal

Dependencies: legal process decision, central policy, support ownership.

Before public registration, implement minimal case intake, human decision, temporary restriction, content-free notice, appeal, access audit, and review expiry. A support-owned manual case register is acceptable for the first launch if it has access controls, review dates, and tested restriction and appeal procedures. Do not build automated age scoring, birthday collection, identity upload, or report-triggered suspension.

Acceptance:

- Raw reports cannot change account state.
- Only an authorized human can record a warranted temporary restriction.
- Restricted users retain policy, sign-out, appeal, and deletion access.
- Every case has an owner, review date, access record, and final disposition.

### P0-13: staged verification and launch gate

Dependencies: all P0 tickets.

Work:

1. Run unit, contract, Flutter, web, realtime, and real-PostgreSQL suites locally and in read-only CI.
2. Run migration checks on fresh and representative synthetic databases.
3. Deploy to isolated staging with synthetic users and lifecycle mode `disabled`.
4. Enable `report_only`. Compare every candidate and manifest with expected fixtures. Keep it report-only through at least two full 14-day simulated-clock cycles or an equivalent deterministic accelerated environment plus a real-time smoke period.
5. Exercise R2 partial failures, Worker termination, duplicated cron delivery, stale leases, Google/password reauthentication, message retention, last-participant deletion, archive expiry, and exact UTC boundaries.
6. Have a second reviewer inspect report-only output and permission grants.
7. Record operator approval, stop procedure, dashboards, alert recipients, privacy backup contact, and rollback version.
8. Enable `execute` only in staging. Use disposable synthetic accounts and objects.
9. Publish final legal documents only after verified behavior and legal/owner approval.
10. Open public registration only after a separate production readiness decision. Production execution starts with a small allowlist or explicit test-account gate before general deletion requests.

Acceptance:

- No destructive action occurs in CI, preview, local shared databases, or production report-only mode.
- Every approved deadline and exclusion has automated evidence.
- Rollback of application code does not lose queued lifecycle state or make hidden content visible.
- Missed-deadline and provider-outage drills reach the named operator and backup.

## Delivery sequence and realistic schedule

For one backend engineer and one client engineer working with part-time owner and legal review, plan for roughly 10 to 14 weeks after the contracts and external decisions are available. Treat this as capacity planning, not a launch promise.

1. **Weeks 1 to 2, inventory and contract freeze.** Complete P0-1, provider inventory, route inventory, legal questions, threat review, and API/state contracts. Do not write destructive code while message reaction handling, existing-user age handling, and export Trash scope remain unfrozen.
2. **Weeks 3 to 5, safe server foundation.** Complete P0-2, P0-3, and P0-4. Prove least privilege and message retention before any physical account purge exists.
3. **Weeks 6 to 8, lifecycle and export vertical slices.** Complete P0-5, P0-6, and P0-7 behind `disabled` mode. Demonstrate one synthetic account and one synthetic post through API, PostgreSQL, R2, and retry checkpoints.
4. **Weeks 8 to 10, legal gates and clients.** Complete P0-8, P0-9, and P0-11. Keep the already completed static legal frontend integration in its own PR and release record.
5. **Weeks 10 to 12, operations and report-only staging.** Complete P0-10 and P0-12, then begin P0-13. Run accelerated boundary tests plus a real-time smoke period. Fix every nondeterministic candidate before staging execution.
6. **Weeks 13 to 14, staging execution and launch review.** Use disposable synthetic data, run failure drills, complete legal and owner sign-off, and decide separately whether production and public registration are ready.

External provider verification, legal review, app-store review, or a messaging migration problem can extend this schedule. Do not compress report-only and execute-mode gates to recover calendar time. If the team has only one implementer, split web/mobile delivery and expect a longer schedule rather than reducing authorization or deletion tests.

## Deferred work

### P1-1: recovery enhancements, only after a new owner decision

This is deliberately outside initial scope. If the owner later asks for recovery work, first define loss tolerance, restore tests, provider retention, deletion replay, cost ceiling, and spending approval. Do not start cost research or enable backups from this plan.

## Error handling and edge cases

- **Exact deadline:** cancellation and restore fail at equality. Job eligibility begins at equality. Tests use database time, not Worker or device time.
- **Concurrent cancellation and worker claim:** both lock the same row. Whichever valid transition commits first wins. A stale generation cannot perform external deletion or publish an archive.
- **Repeated commands:** require idempotency keys for destructive requests. Return the original request/status for identical retries and a conflict for mismatched reuse.
- **Provider failure after database transition:** hidden state remains authoritative. Persist a retry checkpoint. Do not restore visibility because R2, email, socket, or push cleanup failed.
- **R2 succeeds and database fails:** retry treats missing objects as success and continues database cleanup from the checkpoint.
- **Database succeeds and R2 times out:** do not discard the object manifest until R2 confirms deletion or `not found`.
- **Export versus purge:** purge transition cancels queued work, fences active work by generation, and deletes ready archives first. A downloaded local copy remains outside Dayli's control.
- **Post Trash versus account deletion:** account deletion never waits for or extends Trash. Cancellation restores only content active before the account request.
- **Message replies:** retained/exported authored messages cannot include a received body through reply preview, inbox preview, notification, cache, or denormalized quote.
- **Last participant:** conversation cleanup waits until no active user is linked and no participant remains in a cancellation window. It is idempotent and does not depend on a deleted profile row.
- **Immutable revisions:** only the narrow purge operation can delete them. Application edits remain append-only.
- **Shared media:** never delete from ownership alone. Require zero live references across current content, revisions, exports, and in-progress jobs.
- **Restore from provider recovery:** keep restored traffic isolated. Apply deletion suppression and replay cleanup before serving users.
- **Notification failure:** does not change deadlines. Surface delivery status to operators without recording message content.
- **Worker backlog:** bounded batches, leases, jittered retries, per-job-type limits, and oldest-item metrics prevent one provider outage from blocking all cleanup.
- **No approved legal exception:** fail closed on visibility and escalate to the privacy owner. Do not invent an indefinite retention state.

## Required web and native end-to-end tests

The owner explicitly requires E2E tests on both platforms. These are completion criteria, not optional follow-up work. Full checklists are recorded in GitHub #165 and #169.

- Extend the existing Playwright suite for desktop and mobile browser viewports against the real app and an isolated backend/database. A mobile browser does not count as a native test.
- Add Flutter `integration_test` journeys on Android emulator and iOS simulator against the isolated backend, using the real router and storage adapters. Record physical-device and actual Google/provider checks separately when emulators cannot prove them.
- Cover public and offline legal reading, version parity, new/existing-user Terms and age declarations, restricted navigation, password and Google identity verification, deletion and cancellation, Trash and restore, export contents and expiry, recipient message/reaction retention, and last-participant cleanup.
- Test second-user visibility, cross-tab/device revocation, restart, offline/reconnect, stale caches, wrong account, direct URL/deep links, rejected grants, asynchronous retries, and provider failures. Do not substitute mocked policy/DB outcomes or widget rendering for end-to-end proof.
- Use deterministic UTC boundary fixtures or an isolated test clock with no production activation path. Test account/export/Trash races without waiting real days or exposing a public time-travel endpoint.
- Use only disposable synthetic data. Clearly separate local infrastructure-adapter simulations from actual synthetic staging provider evidence. Test mode never enables production destruction.
- Attach runnable commands, setup/teardown, environment/platform versions, named cases, and sanitized evidence to PRs. No real user content, credentials, tokens, or signed links in artifacts.
- Integrate repeatable suites into appropriate CI or gated verification workflows. Unavailable iOS, Android, browser, or provider verification remains an explicit release blocker, not a skipped pass.

Unit, widget, component, contract, and PostgreSQL tests remain necessary but do not replace this matrix. Individual PRs may implement a subset with explicit dependencies; the phase cannot be marked complete until both native platforms and web journeys have the required evidence.

## Verification matrix

| Area | Required evidence |
| --- | --- |
| Database | Fresh migration, idempotent migration checks, restricted-role denial, lifecycle-role scope, foreign-key order, exact UTC boundaries, concurrent state transitions, stale lease fencing |
| API | Authentication, reauthentication grants, route inventory gate, current Terms/age gate, pending-deletion capability allowlist, idempotency, no-store private responses |
| Messaging | Surviving-recipient history, `Deleted account` label, no active profile, no push/socket delivery, reply-preview exclusion, last-participant cleanup |
| Posts and media | Immediate concealment, Trash restore boundaries, account-deletion dominance, immutable-history purge, reference-safe R2 deletion, abandoned upload report-only proof |
| Export | Ownership, block/current authorization, complete approved scope, canary exclusions, bounded memory, 24-hour expiry, purge race, stale URL denial |
| Web | Direct URL bypass, restricted shell, policy access, account switching, cache clearing, material-change acceptance, accessibility |
| Flutter | Restored bearer, Google/password flows, restricted router, protected-state clearing, offline behavior, Android and iOS release checks |
| Realtime and push | Ticket rejection, socket closure, fresh publication check, token invalidation, generic payload, no content in provider errors |
| Logs | Canary scan, retention configuration evidence, incident exception expiry, no URLs/tokens/content |
| Providers | Dated region, analytics, retention, deletion, and recovery evidence without secrets or setting changes |
| Operations | Report-only diff, stop control, single-stage retry, deadline alerts, missed-deadline drill, provider outage drill, operator and backup acknowledgement |
| Release | Legal copy/version parity on every channel, owner and legal approval, staging evidence, manual execute approval, separate public-registration decision |

## Scope boundaries

### In scope for the future implementation

- Account deletion, cancellation, restricted access, purge coordination, post Trash, export, Terms acceptance, age declaration, abandoned-upload cleanup, routine log retention, lifecycle alerts, recipient-message retention, and provider inventory.
- Necessary messaging and foreign-key changes to satisfy deletion rules.
- Web, Flutter, API, schema, generated-client, worker, test, documentation, and deployment-gate changes.

### Out of scope unless separately approved

- Automatic inactivity deletion.
- Added backups, paid recovery, backup cost research, or disabling provider recovery safeguards.
- AI or research use of personal content.
- Birthday or identity-document collection by default.
- Automatic underage suspension.
- Message attachments, background draft uploads, or upload-on-select.
- Group messaging.
- Generic legal holds or unspecified retention exceptions.
- Publication of final legal documents, setting an effective date, enabling public registration, destructive production execution, purchases, or provider configuration changes merely because this plan exists.

## Definition of done

The data lifecycle is ready for launch only when Playwright desktop/mobile-browser E2E and Flutter Android/iOS integration journeys pass against the real isolated stack, required provider/device evidence is recorded, all P0 tickets have reviewed implementation and evidence, every delivery path has a publication gate, provider facts are verified and dated, no stale backup promise remains in public documents, the privacy owner and backup are named, legal review resolves the listed launch questions, staging execute-mode tests pass on synthetic data, deadline alerts are received, and an operator separately approves the production deployment and destructive mode.

Until then, keep lifecycle execution disabled. A merge, migration, scheduled handler, or legal-page publication must never turn on automatic destruction by implication.
