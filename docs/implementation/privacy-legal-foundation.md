# Privacy and legal foundation inventory and contract

Status: additive foundation only. Snapshot inspected on 2026-09-30 at commit `9f0998f`, branch `feat/privacy-legal-foundation`. This document implements the inventory, contract, verification, provider-checklist, integration-boundary work from issue #157, and the safe additive schema and least-privilege subset of #158. It is not a final policy, provider verification record, authorization to run cleanup, or confirmation that the separate legal frontend work has been integrated.

Sources: GitHub issues #157 through #169, the read-only lifecycle plan and legal handoff in the separate `dayli-legal-policy-decisions` worktree, and the code named below. Owner-approved rules, engineering defaults, and unresolved decisions remain separate in this document.

## Execution boundary

- No automatic inactivity deletion.
- Migration `0015_dusty_ben_parker` is additive and was tested only against disposable local PostgreSQL. It creates no scheduled handler, cleanup procedure, runtime binding, or executable physical purge path.
- `packages/domain/src/account-lifecycle.ts` is a pure contract helper. It has no database, Worker, provider, or environment access. Its execution-mode parser defaults missing and invalid input to `disabled`.
- The current scheduled Worker invocation continues to dispatch messaging delivery only. It must not be extended to lifecycle work until a separate reviewed slice has a distinct claim limit, identity, configuration, and evidence gate.

## Current baseline inventory

### PostgreSQL, identities, and application data

All current application data is in PostgreSQL `public`, owned by `migrator`; request handling uses Hyperdrive as `app`. The historical default privilege grants broad DML to `app`, but migration `0015_dusty_ben_parker` explicitly removes `app` deletion of `user` and limits new lifecycle records. The reserved `lifecycle_worker` role has no direct table privilege or runtime binding. This is not a physical-purge path.

| Store or table group | Current records and dependencies | Lifecycle finding |
| --- | --- | --- |
| Better Auth | `user`, `account`, `session`, `verification`, `rateLimit`, and `social_link_confirmation` | `account`, `session`, and social-link confirmations cascade on `user`. Auth is the identity source. No lifecycle or Terms record exists. |
| Posts and private notes | `posts`, `post_revisions`, `post_media`, `legacy_cloudinary_media`, `tomorrow_notes`, `post_idempotency_keys`, and `daily_prompts` | Posts and their children mostly use `NO ACTION`; deletion needs a reviewed child-first path. Idempotency rows cascade from the post and user. |
| Media reservations | `media_reservation` stores a user-owned opaque object key, validation state, and expiry | Reservations cascade from `user`. The source has no object-reference graph, export manifest, or deletion worker. Client attachment linkage is not implemented. |
| Relationships | `friend_requests`, paired `friendships`, `relationship_blocks`, `relationship_search_quota` | Most relationship foreign keys use `NO ACTION`; account purge must deliberately resolve them. The friendship deferred trigger requires both directional rows to change in one transaction. |
| Messaging | `conversations`, `conversation_members`, `messages`, `message_reactions`, `conversation_changes`, `messaging_outbox`, `socket_tickets`, and `push_devices` | Every durable conversation-member and message identity currently references `user` with `ON DELETE CASCADE`. Deleting a user would delete a surviving recipient's conversation, which violates the approved retention rule. |
| Database metadata | `drizzle` schema and migration journal | `app` has no access. Migration history is forward-only and must remain immutable. |

### Referential and trigger hazards

| Object | Current behavior | Required later boundary |
| --- | --- | --- |
| `conversations`, `conversation_members`, `messages`, `message_reactions`, `conversation_changes` | User foreign keys cascade | Do not delete a user until participant identity is decoupled in #160. |
| `messaging_outbox`, `socket_tickets`, `push_devices` | User foreign keys cascade | These are active-delivery records and may be invalidated during a deletion request, but the operation must be idempotent and server-authorized. |
| `posts`, `tomorrow_notes`, `post_revisions`, `post_media`, `legacy_cloudinary_media` | `NO ACTION` foreign keys require child-first deletion | A narrow lifecycle mechanism must own this order. |
| `dayli_post_media_delete_guard`, `dayli_post_revisions_immutable`, `dayli_tomorrow_note_immutable` | Physical deletion currently bypasses immutability when `current_user = 'migrator'` | #158 must replace this broad role-name bypass with a narrowly reviewed lifecycle path. The ordinary `app` role must still be denied. |
| `friendships_pair_guard_trigger` | Deferred reciprocal-pair validation | Lifecycle cleanup must remove or transition both rows transactionally. |
| `posts_author_immutable_trigger` and media identity triggers | Prevent reassignment and historical reference mutation | Lifecycle work must delete in dependency order, never mutate ownership to work around references. |

### Worker, delivery, cache, and device state

| Boundary | Evidence in current code | Lifecycle integration requirement |
| --- | --- | --- |
| HTTP API | `apps/api/src/app.ts` registers Better Auth, media, posting-day, posts, relationships, messaging, realtime, push, username, and system routes | There is no central account-lifecycle policy. #159 must gate every protected route and every public/profile projection server-side. |
| Scheduled work | `apps/api/src/index.ts` dispatches messaging repair only; `apps/api/wrangler.jsonc` schedules it every minute | Lifecycle work needs a separate bounded dispatcher and cannot share an unbounded messaging batch. |
| Realtime | Durable Object `USER_REALTIME`, database socket tickets, and `createDurableObjectRealtimePublisher` | Deletion request must revoke tickets and close/reject sessions. Client cleanup is not authoritative. |
| Push | `push_devices`, encrypted token support, FCM HTTP v1 adapter, and body-free outbox intents | Deletion request must invalidate devices and suppress queued delivery. FCM configuration is present in code, but deployed provider status is unverified. |
| Email | Optional Resend bindings in `ApiEnv` and Better Auth configuration | Confirmation notices need a content-free template and delivery failures cannot alter deadlines. Resend deployment and event retention are unverified. |
| Media objects | R2 S3-compatible presigning, HEAD, and range read code; staging example names only placeholder resources | Object listing, versioning, lifecycle rules, location, retention, and recovery behavior are unverified. No object deletion code exists. |
| Web state | Browser session, query state, and message draft UI are present; theme uses `localStorage` | #165 must remove private caches and session material on a successful deletion request. Theme preference is non-content state. |
| Mobile state | Flutter secure storage holds sessions and per-user drafts; selected attachment paths remain device-local until upload integration | A server purge cannot recall a downloaded archive or device-held draft. The restricted flow must clear account-scoped runtime state without implying device copies are remotely deleted. |

## Lifecycle and retention contract

### Owner-approved product rules

| Rule | Contract or future gate |
| --- | --- |
| No inactivity deletion | No inactivity timer, reminder, or worker candidate query. Contract test rejects any new inactivity execution path. |
| Verified account deletion hides normal access, profile, journals, sharing, sockets, and push immediately | #159 central capability policy and route inventory test, followed by two-user API, socket, and push tests. |
| Cancellation is seven days, then active-system cleanup completes within seven more days | `createAccountDeletionSchedule` and its tests define exact UTC boundaries. PostgreSQL integration must calculate and compare using database time. |
| Retain sent messages for a surviving participant under `Deleted account`; remove the conversation after the final participant's irreversible cleanup | #160 participant migration and two-user retention tests. Current schema blocks execution. |
| Account export covers owned approved data, excludes received bodies, secrets, and reply-preview leaks, remains available while pending deletion, expires 24 hours after ready, and is removed when purge starts | #162 authorization, canary-exclusion, boundary, and export/purge-race tests. No export implementation exists in this baseline. |
| Post Trash hides immediately, restores only before seven days, and cleans up within the following seven days | #163 visibility and exact-boundary tests. No Trash schema or API exists in this baseline. |
| App-controlled routine diagnostic and security records last no more than 30 days, with narrow incident records | #166 requires a log-sink inventory, retention evidence, and incident record. Source inspection cannot verify Cloudflare, GitHub, FCM, Resend, or provider retention. |
| Explicit Terms and separate age declaration are server-recorded for new users; existing users require explicit acceptance before normal use | #164 direct-auth-path and restored-session tests. Current Better Auth routes have no registration intent, Terms acceptance, or age declaration record. |

### Owner decision coverage

This matrix keeps the handoff decisions traceable without turning unverified statements into product claims.

| Owner decision | Automated contract or operator gate |
| --- | --- |
| Public registration follows launch safeguards | #169 requires a separate production-readiness decision. No registration-opening code is in this slice. |
| Operator is an informal group and a backup contact is still required | #166 and #169 require named accountable people before publication or execution. No identity is inferred in records. |
| New Zealand is the drafting basis, worldwide mandatory rights remain protected | Legal review and publication approval gate before effective Terms. |
| Users declare they are at least 16; credible reports receive human review | #164 declaration record and #168 human-review, restriction, appeal, and expiry tests. Raw reports cannot change state. |
| Neon and R2 location claims remain unverified | Provider checklist requires dated evidence before any policy or storage-residency statement. |
| Cloudflare-supplied analytics must be inventoried | Provider checklist and #166 log-sink evidence gate. |
| No research or AI training use of personal content | Legal-content review and release gate must preserve this owner statement without extending it to unverified provider practices. |
| Current data may be stored indefinitely until lifecycle behavior exists | Publication gate prohibits a claim that automated deletion or expiry is live before evidence. |
| No inactivity deletion | No inactivity timer or candidate query. Future route and worker inventory test must reject one. |
| Self-service export, including restricted pending-deletion access and 24-hour ready-archive expiry | #162 export authorization, expiry, and purge-race tests. |
| Individual posts use seven-day Trash plus up to seven days of cleanup | #163 visibility, restoration equality, and deadline-monitoring tests. |
| Verified account deletion immediately restricts normal access, offers seven days to cancel, and targets cleanup by day 14 | Shared boundary contract, #159 policy tests, and #161 database transition and deadline tests. |
| Cancellation restores only still-permitted links and never independently revoked links | Future share authorization test. No share-link table or route exists today. |
| Recipient messages remain under `Deleted account` until the last participant is permanently deleted | #160 two-user retention and final-participant purge tests. |
| Added backups, paid recovery, and cost research are deferred | Provider checklist is read-only. Release gate requires documented recovery risk, not new backup work. |
| Existing provider recovery must be verified rather than assumed absent | Neon and R2 evidence gate, plus later restore-suppression drill in #169. |
| New users need unchecked Terms and a separate privacy notice; existing users must explicitly accept | #164 direct email, browser Google, native Google, restored-session, and existing-user gate tests. |
| Material Terms changes normally receive 30 days' notice; urgent changes need an explanation | #164 legal-version state and notice-timing tests. |
| Routine app-controlled diagnostic and security records are limited to 30 days with narrow incident exceptions | #166 retention-configuration evidence, redaction canary, and incident review-date tests. |

### Frozen engineering defaults in this slice

These are implementation mechanics, not new legal commitments.

- Lifecycle state names while a user remains: `active`, `pending_deletion`, `purging`, and `purge_failed`. Successful completion is represented by a content-free purge receipt after the user and lifecycle record are removed.
- All lifecycle timestamps are PostgreSQL `TIMESTAMPTZ` values based on the database clock. Cancellation is permitted only when `database_now < cancel_until`. A purge is eligible when `database_now >= cancel_until`. The helper in `@dayli/domain` documents and tests those comparisons, but database code must remain authoritative.
- A request will have an immutable request ID and generation. State-changing operations must lock the lifecycle row and compare the expected generation.
- Missing or invalid lifecycle execution configuration resolves to `disabled`. `report_only` and `execute` are vocabulary only here. No configuration binding or handler is introduced.
- Purge receipts must contain no user content, email, or username. The owner selected automatic expiry 30 days after cleanup completion. Opaque references may still be linkable personal data. Any distinct provider-recovery suppression record needs separately justified scope and retention.

### Contract decisions and remaining release gates

The owner resolved the product choices below after this slice. Additive foundation work may proceed under these decisions. Do not enable executable account purge before messaging identity decoupling and permission testing. Operator identification and provider evidence remain release/execution gates; do not invent values to populate records.

1. **Resolved: reactions after deletion.** The owner chose to retain the deleted account's reactions under `Deleted account` alongside retained conversation history, without exposing the deleted profile. Purge them with the conversation when neither participant remains. Participant migration and projection tests must preserve this rule.
2. **Resolved: Trash content in an account export.** The owner chose to include still-restorable posts in a clearly marked `trash/` section. Exporting does not restore content or extend any deletion deadline. Never include permanently purged content.
3. **Resolved: existing-user age declaration and Terms-blocked export.** The owner chose to require existing users to explicitly declare they are at least 16 before normal use, without inferring age or collecting birthdays by default. Inability to declare does not trigger automatic deletion; the support/underage process needs legal review. The owner also approved verified, ownership-checked export without accepting the latest Terms, while ordinary app use stays blocked.
4. **Resolved: purge-receipt retention period.** Retain the minimal completion record for 30 days after cleanup completes, then automatically remove it. Include only the request reference, completion time, outcome, and demonstrably necessary operational metadata; no user content, email, or username. Restrict access and treat linkable references as personal data. Separate provider-recovery deletion suppression requires its own justification; this receipt duration does not establish provider retention.
5. **Responsible operator, backup privacy contact, and incident/publication authority.** These are launch gates and operator-record prerequisites. Do not populate identity fields from assumptions.

Messaging also has a material structural prerequisite: #160 must decouple current cascading user foreign keys before account purge can be executable. This does not require blocking independent additive lifecycle schema work or creating a circular #158/#160 dependency. Gate physical account purge until both the foundation and participant migration are proven.

## #158 additive implementation

Migration `0015_dusty_ben_parker` adds `account_lifecycles`, account-management grants, export requests, minimal 30-day purge receipts, legal document versions, Terms acceptances, age declarations, registration intents, and content-free operator cases. Follow-up migration `0016_breezy_molecule_man` changes the lifecycle and receipt constraints to absolute 168-hour, 336-hour, and 720-hour intervals, and adds durable private export-object cleanup tasks. Both use `TIMESTAMPTZ`, immutable token digests, lifecycle generation, due-work indexes, and an active-export uniqueness index.

An export request is the user-visible state, not a cleanup ledger. `ready` is the only state that may contain an archive key and snapshot cutoff. Terminal requests clear both fields. When an archive must be removed, an `expired`, `cancelled`, or `failed` request may reference a private cleanup task that retains only the opaque object key and retry state until the deletion succeeds, at which point the task is removed. The cleanup task has no user foreign key, so later removal of a terminal request cannot silently discard the pending object cleanup. No application or worker role has direct access to that table in this slice.

The migrations reserve `lifecycle_worker` through the owner bootstrap script, confirm that the role exists before applying, revoke its direct table access, and remove direct `app` deletion of `user`. They also make receipt, operator-case, and export-cleanup rows inaccessible to `app`. Local integration tests prove the constraints, non-UTC DST boundaries, and these denials. No worker may claim, transition, or physically delete a lifecycle subject yet.

The existing immutable-post triggers still name `migrator`. Replacing that bypass requires reviewed, claim-bound procedures and must land with the post and messaging dependency work. Do not grant `lifecycle_worker` direct deletion merely to replace the role name.

## Contract test matrix

| Area | Current automated evidence | Required next automated evidence | Status |
| --- | --- | --- | --- |
| Exact account boundaries | Domain tests plus local PostgreSQL checks enforce absolute 168-hour, 336-hour, 24-hour, and 720-hour boundaries across a non-UTC DST transition, equality, invalid instants, and disabled fallback | PostgreSQL `now()` boundary, concurrent cancel and claim, generation fence, lease retry | Partial foundation |
| Execution disablement | Domain parser defaults missing and invalid values to `disabled`; no handler or binding exists | Worker environment parser and no-handler dispatch test | Partial foundation |
| Account access restriction | None | Route inventory and capabilities tests over every HTTP, socket, push, and projection path | Not started |
| Least privilege | Local lifecycle integration proves `app` cannot delete `user`, and `lifecycle_worker` cannot select lifecycle rows or delete `user` | Claim-bound, reviewed lifecycle procedures after #160 and #163 dependencies | Partial foundation |
| Messaging retention | Existing messaging tests cover active identities | Surviving recipient, `Deleted account`, no profile lookup, final-participant cleanup, reply-preview exclusion | Blocked on #160 |
| Export | Local schema tests fence one active generation, require a 24-hour absolute ready interval, separate terminal request fields from durable cleanup retries, and deny app cleanup-task access | Owned-data inclusion, secret and received-text canaries, pending-deletion access, purge race | Blocked on #159 and #160 |
| Post Trash and object cleanup | Existing media and post tests cover reservations and immutable history | Visibility, exact restore boundary, account-deletion dominance, zero-live-reference object check | Blocked on #158 and account policy |
| Legal acceptance | Existing auth tests cover current sign-up paths | Intent consumption across email and Google, Terms versions, age declaration, existing-user gates | Blocked on #158 and Better Auth hook verification |
| Provider and operations | No lifecycle provider evidence | Dated, sanitized configuration evidence and report-only synthetic runs | External evidence required |

## Provider verification checklist

Snapshot date: 2026-09-30. The findings below are source-inspection results, not provider-console evidence. No credential, resource ID, or connection string is recorded.

| Provider or sink | Source evidence | Verified fact | Unknown, or evidence required | Owner action |
| --- | --- | --- | --- | --- |
| Neon PostgreSQL | `docs/dayli/database-migrations.md`, Hyperdrive code, and database role scripts | The repository defines separate `migrator` and `app` roles and a direct migration path | Exact region, point-in-time recovery, branch retention, snapshot/export behavior, deletion behavior, and restore-point availability | Record dated console or owner evidence without secrets. |
| Cloudflare R2 | `r2.ts` and staging example configuration | R2 is an optional application object-store integration | Bucket location behavior, versioning, lifecycle rules, replication, deleted-version recovery, object listing, analytics, and log retention | Record dated console evidence. Do not alter rules. |
| Cloudflare Workers, Hyperdrive, and Durable Objects | `wrangler.jsonc`, `index.ts`, and realtime code | Observability is enabled in repository configuration; one-minute cron and Durable Object binding are declared | Deployed observability/log retention, analytics/security identifiers, Hyperdrive target, Durable Object persistence and retention | Record sanitized dashboard evidence. |
| Firebase Cloud Messaging | FCM adapter and optional Worker secret | The code can send body-free notifications when configured | Project deployment, provider data processing, delivery logs, token handling outside the app, retention, APNs bridge behavior | Obtain provider and owner evidence. |
| Resend | Optional runtime bindings and Better Auth configuration | The code can use Resend for authentication email when configured | Deployment, events, log retention, bounce handling, and data processing | Obtain provider and owner evidence. |
| GitHub Actions and artifacts | Repository workflows and local docs | Workflows can create engineering evidence | Artifact/log retention and whether content can enter artifacts | Inventory settings and add content-free logging controls later. |
| Web hosting and mobile crash tooling | No configured dedicated source found in this snapshot | Not applicable only to repository-configured tooling | Actual deployed hosting logs, browser analytics, crash tooling, store diagnostics | Owner must identify enabled services. |

## Integration boundaries and handoff

- Keep legal frontend integration separate. This branch does not copy, merge, commit, or claim dependencies from the dirty legal frontend worktree or obsolete PR #138.
- #158 has the safe additive schema and no-direct-access role subset in `0015_dusty_ben_parker`. It deliberately does not add executable account purge. Keep unidentified operator fields unpopulated and release gated rather than inventing identity data.
- #159 owns the single server account policy. Do not place lifecycle authorization in web or Flutter routing, individual feature routes, or Better Auth client callbacks alone.
- #160 must land before any code can physically delete a `user`. Its participant migration is required to preserve recipient message history.
- #161 owns state transitions and purge orchestration. It must use a dedicated binding or narrowly scoped database procedure, never the migrator credential in request handling.
- #162 owns R2 export objects and authorization-aware archive contents. It must not reuse journal-media object keys or expose object keys in logs.
- #163 owns post Trash and abandoned reservation discovery. It must not add upload-on-select or background draft upload behavior.
- #164 owns Terms, age, and registration intents. It must verify Better Auth email, browser Google, and native Google creation paths before choosing a hook or wrapper.
- #165 owns browser and Flutter restricted experiences. Server decisions remain the source of truth.
- #166 through #169 own operational retention, release gates, human review, and staged evidence. No provider setting change or production execution belongs in this slice.

## Stale documentation register

The following current documents contain older recovery targets or deletion wording and need a later owner-approved reconciliation. They are not changed here because provider facts remain unverified and this slice does not publish legal copy.

- `docs/dayli/security.md` refers to 30-day backup expiry.
- `docs/dayli/testing-and-delivery.md` states 24-hour RPO, 8-hour RTO, and 30-day encrypted-backup expiry.
- `docs/dayli/product-decisions.md` describes migrator-run cleanup and a 24-hour RPO and 8-hour RTO.
- `docs/dayli/implementation-reference.md` refers to a 30-day backup expiry.
- `docs/dayli/scalability.md` asks for restoration tests against 24-hour RPO and 8-hour RTO.

These claims must not be copied into final policy language. Replace them only with dated provider evidence and owner-approved operational posture.
