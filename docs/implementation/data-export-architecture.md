# Data export architecture and data inventory

Status: approved engineering direction, not an enabled export service. The inventory prerequisite is merged as PR #251. Draft PR #252 implements restricted sources and archive processing, but its routes and scheduled jobs remain disabled. This document records the owner decisions for #157 and #162. It does not approve production activation, legal publication, provider purchases, or destructive lifecycle execution.

## Decisions

- A self-service export contains the account holder's approved profile fields, owned journals and revisions, private tomorrow notes, authored retained messages that the requester can currently access, restorable Trash, owned upload bytes once ownership can be proved, and minimal Terms acceptance and 16+ declaration records. It excludes received message bodies and copied reply previews, other users' private data, credentials, sessions, provider tokens, secret keys, raw logs, purged data, and unreviewed fields. No date of birth or identity document is collected for the declaration.
- Export is explicit and default-deny. A new database table or column, JSON key family, or object namespace does not automatically become downloadable. CI requires an ownership, export, deletion, retention, access, retained-other-user, Trash/restore, and test classification before the change can merge. Record `not_applicable` explicitly where a category does not apply. An exclusion is an explicit classification, not a reason to skip review.
- The archive is a versioned ZIP with machine-readable records and a manifest. Its `selectionCutoffAt` is a selection cutoff, not an atomic historical database snapshot. Each source applies it independently, so an archive can contain a mixed-time view. Do not call it a consistent snapshot.
- Downloads use an authenticated API route with fresh ownership and lifecycle checks, not a signed object URL. Ready archives expire after 24 hours. An export neither delays nor extends account deletion. Publication after purge begins is forbidden.
- This self-service product archive is not a promise that it contains every piece of personal information Dayli might need to consider for a separate formal access request. Such requests need their own review path and applicable legal advice.

## What exists and what does not

Main has the lifecycle schema foundation and checked-in inventory. PR #191 is an unfinished historical branch and is not a source to merge wholesale. In that branch, `packages/db/src/export-worker.ts` loops over `profile`, `journals`, `revisions`, `notes`, and `messages`; `packages/db/migrations/0034_export_source_budgets.sql` explicitly accepts those kinds and defines their bounded SQL projections; `apps/api/src/features/data-export/build-export/export-worker.ts` has a separate archive manifest list. These are the present allowlists, not a single extensible registry. The migration number is branch-local and must be reconciled with published main before any integration.

Those historical projections do not prove owned upload bytes, Terms acceptance, age declarations, restorable Trash, or current message readability. Draft PR #252 replaces them with explicit reviewed sources, lease-fenced file proofs, a versioned ZIP, and restricted publication and download checks. Expiry and irreversible purge queue durable cleanup, and the purge transition clears ready access in its database transaction. The independent web account route bypasses the ordinary username gate for eligible restricted owners. The native route also allows signed-in owners without a username and shares a streamed ZIP through the device sheet, removing its temporary copy afterward. Both clients, API requests, and scheduled worker execution remain hard-disabled. The ZIP now includes owner-scoped metadata for detached post media and profile avatars without treating a detached reference as permission to read its bytes. Local tests use synthetic provider responses, not live R2. Independent review, remaining negative and concurrency canaries, and live R2 behavior remain open. Do not merge #191 or the frozen export code in #196 as if those gaps were closed.

## Target design

### 1. Checked-in data inventory

Keep a version-controlled inventory under `packages/db` or `docs/implementation` with machine-checked identifiers. Every Dayli-owned persistent table and column in the baseline gets an accounting entry. Straightforward columns may share a table-level decision; user content, secrets, third-party data, ownership keys, free-form JSON, and mixed-use columns need explicit field or key-family decisions. Include Better Auth storage, lifecycle records, retained messaging data, logs under Dayli's control, and object namespaces in the review. Record external provider storage and retention separately where it cannot be introspected from migrations.

Each entry states its owner relationship, export treatment, deletion treatment, retention rule, access boundary, retained-other-user behavior, Trash/restore behavior, and behavioral test reference. An example of the intended shape, not an implemented API:

```ts
const dataInventory = {
  "public.posts": {
    owner: "author_id",
    export: { kind: "journal", fields: ["id", "caption", "reflective_answer"] },
    deletion: "purge_with_account",
    retention: "while_owned_or_restorable",
    access: "owner_scoped_projection",
    retainedForOthers: "not_applicable",
    trashRestore: "include_only_while_restorable",
    tests: ["journal_export_owner_isolation"],
  },
  "public.session": {
    owner: "user_id",
    export: "exclude_credentials_and_session_state",
    deletion: "revoke_then_purge",
    retention: "auth_policy",
    access: "auth_only",
    retainedForOthers: "not_applicable",
    trashRestore: "not_applicable",
    tests: ["session_never_in_archive"],
  },
} as const;
```

The actual schema must be inventoried in full. This snippet does not imply that the three example post fields are the complete approved projection. In particular, a table-level shorthand must never hide an unclassified new column.

In CI, migrate a disposable PostgreSQL database and compare its relevant schemas, tables, and columns against the inventory. Fail on missing or stale identifiers, unclassified additions, or missing retained-other-user and Trash/restore decisions. Use an explicit registry for object key namespaces and prohibit free-form new prefixes through a repository check. Inspect JSON payload schemas and object ownership paths separately since SQL column introspection cannot reveal their contents. Check that every approved export source has a test and that every declared exclusion has a negative canary. The inventory records decisions; it must not generate SQL grants or `SELECT *` exports.

### 2. Reviewed source contracts

Use one typed list of approved source kinds and record types to drive worker iteration and archive-manifest declaration. Each kind still has an explicitly reviewed, versioned database projection or file adapter. CI checks the list against procedures, inventory entries, and archive tests. Do not build SQL by concatenating table names or expose a general table export endpoint.

A new diary feature, for example, would classify its columns, add a `diary` kind, then add a query selecting approved fields from rows owned by the requesting user. The query uses stable keyset pagination, a bounded response, record-size limits, and the recorded selection cutoff. It never selects arbitrary columns. For authored messages, also check the same membership and readable-history policy used by the message-read API on each page; participant authorship alone is insufficient. A block stops new peer-visible activity but does not remove access to existing message history. Add fixtures proving the owner's accessible records, including authored history in a blocked conversation, appear while another user's diary, unapproved fields, received bodies, and genuinely inaccessible history do not. Decide declined requests and any future revoked state from their actual read policy, not from their status name alone. Derive the manifest kinds from the same source declaration to avoid the current three-list drift.

### 3. Restricted reads and lifecycle fencing

The ordinary app role must not acquire blanket table read grants for export. Export workers use narrowly granted, owner-scoped database procedures. A claim binds the request ID, subject, lifecycle generation, unexpired lease token, and database-clock cutoff. Check the lease and lifecycle state at every page or object authorization boundary, not only when work starts. Bound page size, record size, total archive size, and work per scheduled invocation. Cursor order must not drop or duplicate records when rows change. Recheck generation and account state before publishing and before every authenticated download. No database transaction stays open during R2 I/O.

An export accepted during pending deletion may complete only while that lifecycle state permits it. At irreversible purge, cancel pending builds, fence old generations, and remove ready archives without moving the deletion deadline. A downloaded local copy cannot be recalled.

### 4. Owned files and archive format

Before adding binary uploads, introduce and test an authoritative relationship among user, post or restorable Trash item, media record, and R2 object key. Resolve references under the same ownership policy used by export and deletion. Do not assume an attachment reference or an object prefix proves ownership. Never include another user's upload or a deleted/unreferenced object. Stream approved bytes without holding an unbounded archive in Worker memory. Give the archive a versioned manifest describing record kinds, selection cutoff, and included file categories. Preserve content without rewriting user text merely because it resembles a URL; do not emit secret URLs or keys from internal records.

### 5. Durable cleanup and provider failure

Persist cleanup ownership before creating an archive object or multipart upload. Fence every inventory operation to the current unexpired lease. Reconcile known IDs with a bounded namespace listing so late completions cannot escape a finite cleanup attempt. Under the owner-approved cleanup-evidence rule, retain only digest, category, count, and timestamps while an incident remains unresolved; delete the minimal evidence 30 days after resolution. Do not retain archive content or raw object keys as incident evidence. Expiry and account purge both schedule archive cleanup, and a provider timeout remains retryable without reopening access. Use fault-injected HTTP locally and separate live R2 verification before release. `pnpm exec tsx apps/api/scripts/export-r2-live-proof.ts` is an opt-in synthetic provider check. It refuses to run unless `EXPORT_R2_PROOF_APPROVED=synthetic-only`, `EXPORT_R2_PROOF_BUCKET` and `R2_BUCKET_NAME` name the same dedicated `dayli-export-proof-*` bucket, and the four R2 credentials are present. It writes no account data, reports unresolved synthetic object keys only when cleanup fails, and is not a substitute for an independently reviewed production rollout.

## Required implementation sequence

1. Build and independently review the baseline inventory, CI schema-diff check, object namespace registry, and negative tests. Introduce no automatic data inclusion.
2. Reconcile #191's unpublished migrations against current main. Refactor its duplicated source lists into one reviewed source declaration while preserving explicit SQL authorization. Repair pagination throughput and lease/incident findings.
3. Complete account, journal, revision, private note, minimal Terms/age evidence, currently readable authored-message, and restorable-Trash projections. Match the message-read API's membership and history authorization, including readable history after a block and any applicable request state; authorship alone does not authorize a message export. Confirm that reply previews do not disclose received bodies. Add owned file bytes only after the object relationship is proved.
4. Prove request, claim, build, publication, authenticated download, expiry, deletion races, late provider completions, cleanup, and real restricted-role denial on disposable PostgreSQL. Test web and native account journeys separately. Keep worker activation disabled until every gate passes.
5. Independently review each scoped PR, run the full local verifier against its actual immutable main base, require green exact-head CI, then squash merge one PR at a time as explicitly directed by the owner. Admin review bypass is for independently cleared, green batches only. The existing owner authorization allows automatic staging migrations and API/web deployment after green main CI, with target, role, and migration verification safeguards. It does not enable export workers or destructive lifecycle modes. Report-only and execute modes require their separate staging reviews and approvals. Production migrations and destructive runtime activation remain manual and unauthorized here.

## Verification examples

- Add an unclassified table, relevant column, or object namespace. CI fails. Classify it as excluded and CI can pass only when the stated denial and retention tests exist. Classify it as included and its positive ownership and completeness tests are required.
- Seed two users with similar IDs, owned and received messages, a blocked conversation with readable authored history, request states with their actual read policies, reply previews, Trash, revisions, Terms/age evidence, auth secrets, JSON payloads, and file objects. The archive contains all approved currently readable owned records and bytes, but none of the negative canaries. Ensure records deleted before selection are not resurrected.
- Run two PostgreSQL connections so cancellation, purge claim, lease expiry, publication, and download contend with export reads. Stale work must never publish or disclose bytes.
- Inject multipart completion, abort, listing, and delete failures, including a delayed completion after an earlier successful pass. Prove the inventory catches it, incidents eventually resolve, and no unowned object is deleted.
- Check archive version and manifest against actual emitted kinds, bounded resource use, database role permissions, and authenticated web and native downloads. Distinguish local mock results from live-provider evidence.

This architecture is meant to make future features easy to add **safely**, not automatically exportable. The recurring cost is one explicit data decision, one scoped source, and tests when a feature adds user data.
