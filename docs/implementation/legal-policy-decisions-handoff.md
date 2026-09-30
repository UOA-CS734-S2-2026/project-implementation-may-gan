# Dayli legal policy and data lifecycle handoff

Status: frontend drafts implemented and agent verification reported complete. Owner chose no automatic inactivity deletion for now. The owner has approved design decisions below, but has not authorized backend implementation, destructive execution, purchases, or publication of final legal documents. The Privacy Policy and Terms of Service remain draft documents with no effective date.

## Purpose and branch context

Capture the owner's answers and recommended next steps for Privacy Policy, Terms of Service, and data lifecycle implementation. The owner has authorized accessible frontend drafts for web and Flutter. The owner chose no automatic inactivity deletion for now. User-requested deletion, export, and acceptance design decisions are recorded below. They are planning requirements, not authorization to implement or operate destructive jobs.

This document was created in a separate worktree from freshly fetched `origin/main` at `3a547ce`, on branch `docs/legal-policy-decisions`. The original working directory contains unrelated work and must not be modified by this task.

The existing legal page implementation is in [draft PR #138](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/pull/138), branch `feat/legal-pages-web-mobile`, targeting `docs/messaging-architecture-handoff`. At preparation time the PR is open and its legal content files are not on this main baseline.

That PR contains public web pages, offline Flutter screens, shared JSON documents, a synchronization script, tests, and draft publication checks. The current worktree selectively integrates that legal-content approach after reviewing current routing, auth, Settings, messaging, and media code. It does not copy older application routing or authentication files.

This handoff supersedes neither source code nor approved product decisions. Where the owner's current operational report conflicts with older architectural plans, record and verify the conflict before changing public claims.

## Confirmed owner statements

These are statements from the owner, not independently verified infrastructure facts:

| Topic | Owner statement | Implication |
| --- | --- | --- |
| Operator | agroupforcoders, an informal group of friends, not an incorporated company | Do not describe it as a registered company. Identify the actual responsible operator before final terms. |
| Contact | agroupforcoders@gmail.com | Owner will personally monitor privacy/support requests and coordinate incidents, with a backup from the group to be nominated before launch. Establish monitoring and escalation procedures. |
| Audience | Primarily New Zealand, available worldwide; public registration selected | Anyone meeting eligibility may register after launch safeguards and legal review. New Zealand is the starting jurisdiction for drafting, not an exemption from applicable overseas law. |
| Minimum age | 16 and older | Require an explicit age declaration during onboarding and record that declaration. Do not collect full birth dates or ID documents by default. A declaration is not verified proof of age. Existing users must also explicitly declare they are at least 16 before normal use when the rules launch. Do not infer age from previous use or automatically delete accounts whose users cannot make the declaration; provide the reviewed support process. For credible evidence of an under-16 account, a team member first reviews the report, then temporarily restricts access if warranted and offers a way to challenge mistakes. Do not auto-suspend from unverified reports or routinely request identity documents. Final deletion and safeguarding procedures require legal review. |
| Storage | Neon PostgreSQL and Cloudflare R2, believed to be in Sydney or Southeast Asia | Verify exact regions and provider processing before publishing residency claims. |
| Analytics | Only what Cloudflare supplies | Inventory enabled Cloudflare analytics, security logs, identifiers, and retention. Do not translate this into "no analytics" or "no tracking" without verification. |
| Research and AI | No research or AI use | State that Dayli does not use personal content for research or AI training. Do not make unsupported guarantees about every provider's practices. |
| Current retention | Data currently stored indefinitely | A future cleanup target is selected below, but not implemented. Do not claim automated expiry currently works. |
| Inactivity deletion decision | No automatic inactivity deletion for now | Prioritize a verified user-requested deletion process and periodic retention review. This is not approval to retain every data category forever. |
| Personal data export | Self-service Download my data before public launch | Provide it in web and Flutter Settings with identity verification and safe delivery, including access before deletion. Include account/profile details, journal content and revisions, private notes, retained uploads, and retained messages authored by the requesting user. Include still-restorable posts in a clearly marked Trash section, without restoring them or extending their deletion deadlines. Exclude received message bodies, other users' private journals, passwords, session tokens, internal security logs, and already-purged content. Do not bypass block or current authorization rules, or leak received-message text through reply previews. This product export does not replace legally required access-request handling. Generated archives expire 24 hours after becoming ready, require sign-in and ownership authorization, and are deleted after expiry. Users may request a fresh archive. Already-downloaded copies cannot be recalled. During the 7-day cancellation window, permit verified export through a restricted account-management screen alongside cancellation, policy reading, and sign-out. Export requests do not cancel or extend deletion. Delete generated archives when irreversible cleanup begins even if their ordinary 24-hour availability has not expired. |
| Individual post deletion | 7-day Trash/restore window, then cleanup within 7 additional days | Hide the post and disable sharing immediately. Let the author restore during the first 7 days; after expiry remove its revisions, associated private notes, and unreferenced attachments within a further 7 days. Provider recovery expiry remains separate. Define Trash access and permission-safe link restoration, and ensure post restoration cannot reactivate a deleted account. |
| Account deletion interface | In-app Delete account flow | Plan identity verification and a tested backend cleanup process accessible from web and Flutter Settings. |
| Deletion cancellation window | 7 days | Disable normal account access immediately after a verified request and offer a separate verified cancellation flow. Begin irreversible cleanup after the window expires. Finish active-system cleanup within 7 additional days, at most 14 days from the verified request. This is an approved design target, not yet a public operational guarantee. Retained recipient messages are an exception; provider recovery expiry remains separate and unverified. |
| Pending-deletion visibility | Hide profile and journal posts immediately | Disable sharing and normal content access upon the verified request. Cancellation restores access only under current permissions. Owner chose to restore eligible old public links where sharing is supported: temporarily suppress links during pending deletion and re-enable only links that were valid before the request and are still permitted. Never revive independently revoked links, deleted posts, or access disallowed by current privacy settings. Recipient message history follows its separate retention rule; downloaded copies cannot be recalled. |
| Deletion completion receipts | Delete 30 days after cleanup completion | Retain only minimal operational evidence, such as opaque request reference, completion time and outcome. No content, email or username. Restrict access; linkable references remain personal data. A distinct provider-recovery suppression record needs separate scope and retention justification. |
| Current backups | Owner reports no backups | Verify Neon recovery history, provider backups, exports, and any R2 versioning before saying no recoverable copies exist. |
| Recovery planning | Owner now leans toward no added backups while starting; defer additional backup implementation in the initial plan | Do not assume paid recovery or additional backups are approved. Still inventory existing Neon/R2 recovery settings, retention, and limits and document the risk of permanent journal loss. The owner said "probably", so confirm the final launch posture before publishing a no-backup statement. Existing provider recovery is not disproved by the absence of operator-managed backups. Cost comparison and added recovery can be a later phase; no spending is authorized. |

The owner selected public registration, not an invited-only pilot. New Zealand law is selected as the drafting basis, subject to legal review and preserving mandatory rights in other countries. Final approval arrangements remain undecided. This is a launch direction, not authorization to deploy or bypass safeguards.

Terms acceptance decision: require explicit agreement with an unchecked control and server-side storage of user ID, accepted terms version, and acceptance timestamp across email and Google account creation on web and Flutter. The Privacy Policy remains a separate notice, not blanket consent. This approves the design direction, not immediate backend changes. Existing users must explicitly accept the first approved terms on their next visit before normal app use resumes. Reading policies, signing out, requesting deletion, and verified ownership-checked export must remain possible without acceptance. The owner explicitly approved exporting existing data without agreeing to the latest Terms; ordinary app use stays blocked. Never backfill or infer acceptance from prior use. For material terms changes, normally give 30 days' notice through in-app notices and email where available, and require explicit acceptance of the new version for continued normal use once effective. Minor wording fixes need not trigger reacceptance. Urgent legal/security changes may require shorter notice with an explanation. Preserve policy reading, sign-out, and account-deletion access without acceptance. Exact authentication mechanics remain to be designed.

Account deletion decision: keep sent messages in recipients' conversations and replace the sender's profile with "Deleted account". The owner also selected retaining the deleted account's message reactions under the same label, without exposing the deleted profile; remove these with the conversation when neither participant remains. This is a deliberate retention exception, not anonymization: message text may still identify the deleted user. Explain it clearly in the deletion confirmation and Privacy Policy. Do not preserve the active profile, credentials, or unrelated journal data merely to support message display. The owner also decided to delete the conversation and associated data during the last participant's cleanup once neither participant remains and both cancellation windows have ended. Until then, retain history only for the remaining participant's access. Define minimum retained identifiers, pending-deletion visibility, and handling of privacy/legal removal requests before implementation.

A pilot means a limited trial with invited testers. Public means anyone can register. Both need privacy safeguards; beta status does not waive legal obligations.

## Drafting direction

Suggested operator introduction, subject to final identity review:

> Dayli is operated by agroupforcoders, an informal group of developers based in New Zealand. For privacy questions, account requests, or support, contact agroupforcoders@gmail.com.

Confirm the group's New Zealand operating location and the actual responsible people before treating this as final wording. A group name may not sufficiently identify the contracting party. Nominate a privacy contact and confirm any address disclosure requirements without publishing a private home address by default.

Privacy text should cover actual account, session, post, revision, relationship, local device, and media data. Identify optional Google authentication and transactional email processing if enabled. User content is server-readable; do not claim end-to-end encryption.

Explain the provider roles and overseas processing in plain language. R2 region preferences do not establish that every log, support operation, or processing activity remains in that region. Database storage is not the only place personal data can exist.

Terms should preserve user ownership, grant only the permission needed to operate Dayli, prohibit abuse, describe reasonable suspension/reporting procedures, and preserve mandatory consumer rights. Do not invent subscription terms, blanket liability exclusions, arbitration, or permission for AI training.

The owner selected New Zealand governing law as the drafting basis, subject to qualified legal review. Do not add mandatory arbitration or require every overseas user to litigate in New Zealand by default. A governing-law clause does not override mandatory protections elsewhere. Worldwide availability and users aged 16 or 17 need appropriate legal review.

## Frontend draft implementation checkpoint

The draft frontend uses one canonical JSON document for each policy in `packages/legal-content`. The web reads those documents directly. Flutter bundles byte-for-byte synchronized copies so the pages work offline. The `legal:check` command validates this parity. `legal:publish:check` rejects a draft or document without an effective date, and `legal:release:check` runs both checks. Existing PR, local, and staging builds intentionally allow drafts so the frontend can be reviewed. GitHub #167 must wire the release check into every final delivery path before any approved policy is released.

Public `/privacy` and `/terms` routes are available on web. Flutter makes the same routes available without waiting for session restoration and without redirecting signed-in users. Links appear on the landing, authentication, and Settings screens. The links do not alter authentication or record acceptance.

The draft wording now reflects the confirmed operator, contact address, 16+ audience, worldwide availability, current indefinite storage report, reported Neon and Cloudflare R2 use, Cloudflare-provided analytics, and no research or AI use. It names current email/password authentication, conditional Google sign-in, conditional Resend authentication email, direct messaging, Firebase push, post revisions, and device-held drafts. It says that selected media stays on the device because the current clients do not post it. It does not make unverified claims about provider regions, recovery copies, exports, deletion, or response times.

The frontend E2E slice runs public policy and entry-point journeys in Playwright against the disposable local Worker, database, and Next server on desktop and mobile browser viewports. Its Flutter integration test uses the real router, protected storage, generated clients, and bundled assets against an unused loopback origin to prove offline legal reading without a fake session controller. It is not evidence of real native authentication or future lifecycle behavior. Android emulator coverage is available locally. iOS simulator and provider-backed native journeys remain separate release blockers.

## Retention decisions and unresolved proposals

Rows explicitly marked as owner-approved are design targets, not verified operational guarantees or instructions to delete data now. Other rows remain proposals. None of these figures should be presented as a statutory period.

| Category | Proposed starting point | Decision or implementation needed |
| --- | --- | --- |
| Active account and journal history | Keep while the account is active and retention supports the user's journal | Define active status and user controls. Old journal entries do not need deletion solely because they are old. |
| Closed accounts | Owner approved 7 days to cancel, then at most 7 additional days for active-system cleanup | Hide profile/posts and disable normal access immediately. Preserve recipient messages under the agreed exception. Provider recovery expiry and individual post-deletion timing remain separate. This replaces the earlier proposed 30-day account purge. |
| Inactive accounts | No automatic inactivity deletion for now, confirmed by owner | Earlier 24-month and 30-day warning suggestions are not adopted. Periodic retention review remains necessary. |
| App-controlled diagnostic/security logs | Owner approved a maximum of 30 days for routine records, shorter where practical | Exclude private content, passwords, tokens, and signed links. A narrow incident-related extension needs a documented reason and review date. Provider-controlled logs still require separate inventory and verification. |
| Abandoned uploads | Owner approved deletion after 7 days if such files exist | Owner expects selecting media alone not to upload it. Do not introduce background draft uploads. Failed or interrupted upload-then-link operations can still leave unreferenced objects. Confirm age and absence of valid references, protect in-progress uploads/retries, and test in report-only mode before enabling cleanup. |
| Recovery copies and future backups | No added backup setup or paid recovery in the initial scope; this is a tentative launch posture | Inventory existing Neon and R2 recovery, versioning, and retention without changing settings. Record the risk of permanent loss. Do not claim that provider recovery copies do not exist, disable provider safeguards, start a cost-research project, or spend money. Any recovery enhancement is a later owner decision. |

New Zealand Privacy Principle 9 requires information not be kept longer than necessary for a lawful purpose. It does not prescribe these particular durations: https://www.privacy.org.nz/privacy-principles/9/

An email-based request process can be an initial interface only if someone can safely execute and track it. Adding a mail link does not implement deletion or access rights.

## Discussion queue

Ask the owner one question at a time. Explain the consequences in ordinary language. Do not treat recommendations in this document as owner approval.

### 1. Automatic deletion of inactive accounts

Decision made: the owner selected no automatic inactivity deletion for now. Do not implement reminders or deletion timers without a later explicit decision. The alternatives below are retained for future reference, not as an open first question:

- No automatic deletion yet, with periodic retention review and a working deletion request process.
- Reminders after a defined inactivity period, with no deletion until a later approved policy.
- Automatic deletion after a defined period and advance warning, with a tested cancellation and recovery design.

For a personal journal, unexpected deletion can destroy important memories. Avoid turning a speculative 24-month suggestion into a destructive default. No automatic deletion does not mean every category may be kept forever without purpose or review.

If automation is selected, resolve these separately:

- What counts as activity: successful login, authenticated app use, a post, or another deliberate action. Background refresh alone may be misleading.
- Whether offline mobile drafting counts, and how to avoid deleting an account whose owner still uses local drafts.
- The inactivity threshold, notification channels, grace period, and handling of bounced or unverified email.
- Whether signing in cancels pending deletion and when deletion becomes irreversible.
- Whether users can export or explicitly preserve their journal before deletion.
- Whether account deletion affects recipients' message history, shared posts, revisions, and relationship records.
- Whether to grandfather existing accounts and how to notify them of a new rule.

### 2. User-requested deletion

Decision made: the owner selected an in-app Delete account flow rather than email-only requests. This selects the interface, not approval to run destructive jobs. Plan it in both web and Flutter Settings with identity verification and tested backend cleanup. The owner also selected a 7-day cancellation window: disable normal account access immediately and provide a separate verified cancellation flow. Begin irreversible cleanup after expiry. Hide profile and journal access immediately, finish active-system cleanup within 7 additional days after cancellation expires, and retain recipient message history until neither participant remains. Allow verified export during cancellation without extending the deadline. Individual posts use an approved 7-day Trash/restore window, with immediate hiding and subsequent cleanup within another 7 days. Plan interaction with account deletion so neither flow silently extends the other. Narrowly scoped lawful retention exceptions still need review. Ordinary sign-in must not silently cancel deletion.

Any verification must be proportionate. Do not collect identity documents by default when account-based verification can suffice.

### 3. Backups and data loss

Latest direction: the owner said they probably will not add backups while Dayli is starting. Defer added backup setup, paid recovery, and cost research from the initial implementation. Inventory the recovery and retention already supplied by Neon and R2, without changing or disabling provider settings. Record the risk that journal data may be permanently lost. This tentative posture does not prove that provider recovery copies are absent and must be confirmed before publication. Any later recovery work must prevent a restore from reviving content that users deleted.

### 4. Acceptance and age eligibility

Selected design direction, pending implementation and legal review:

- An unchecked Terms agreement control before account creation.
- A separate Privacy Policy link as a notice, not bundled permission for unrelated processing.
- A declaration that the user is at least 16 without collecting a full birth date unnecessarily.
- Server-side terms document version and acceptance timestamp.
- Coverage for both email and Google account creation on web and mobile.

Do not confuse displaying a checkbox with recording enforceable acceptance. Apply the confirmed existing-user and material-change acceptance decisions above. Design registration bypass prevention and Google account creation through sign-in routes. This is a backend/auth contract change, separate from static legal pages.

### 5. Launch and legal responsibility

Public registration, worldwide availability with a New Zealand focus, owner-monitored contact, New Zealand drafting law, and normally 30 days' notice for material terms changes are selected. Confirm actual responsible operator identity, backup privacy contact, legal reviewer and final approver. Set an effective date only when the policy actually takes effect.

## Implementation sequence after decisions

### Phase A: Inventory and draft updates

1. Read current main and inspect PR #138. Recheck whether messaging, media uploads, deletion, exports, and auth flows have changed since the earlier plan.
2. Inspect provider settings through authorized access or obtain owner evidence. Do not read or publish credentials.
3. Update the legal draft with confirmed operator, contact, age, and no-research/no-AI facts. Keep unknowns in an internal checklist and keep draft publication safeguards.
4. Record approved decisions separately from recommendations, including approver and date. Reconcile older 30-day backup/cleanup architecture statements with actual deployment.

### Phase B: Data lifecycle design

Only after the owner chooses deletion behavior:

1. Inventory tables, foreign keys, immutable revision triggers, R2 objects, sessions, provider associations, mobile drafts, caches, share links, and any messaging/socket/push records that now exist.
2. Define request, cancellation, access revocation, purge, failure, and completion states. Choose a least-privilege execution mechanism rather than granting the ordinary app migration privileges.
3. Design idempotent bounded cleanup, retries, race protection, observability, and minimal audit evidence. Avoid retaining deleted content in audit records.
4. Separate database cleanup from object storage deletion safely. Document partial failures and retries rather than claiming one cross-provider transaction.
5. Prevent content recreation, new writes, delayed outbox delivery, or backup restoration from reviving deleted accounts.
6. Distinguish server deletion from recipient copies and device-held data. Remote deletion cannot guarantee wiping an offline device.
7. Prepare synthetic-data tests and a dry-run/report-only rollout. Destructive production execution requires separate explicit approval, monitoring, and a stop mechanism.

### Phase C: Acceptance implementation

After approval, create a focused auth contract and migration plan for minimal acceptance records. Preserve server authority over document version and timestamp, prevent registration path bypasses, and minimize extra personal data. Coordinate with owners of active auth and onboarding changes.

### Phase D: Final policy and release

Make policy claims match verified behavior. Synchronize web and bundled Flutter documents using the existing legal-content system. Check dates and versions match. Release final text only after owner approval and any required legal review.

Review publication guards across actual deployment paths, not only one script. A guard in `build:vinext` alone must not be assumed to block every Next.js build or mobile release.

## Verification requirements

Owner explicitly requires end-to-end tests on both web and native Flutter. GitHub #165 and #169 contain the full required checklist. Use Playwright desktop/mobile-browser journeys and Flutter integration tests on Android and iOS against an isolated real backend with synthetic data. Cover identity, legal/age gates, restricted access, deletion/cancellation, Trash, exports/expiry, and retained messaging, including cross-user/device and error cases. Unit and widget tests are not substitutes. Actual provider and physical-device gaps remain release blockers; never treat a skipped platform as passed.

- No destructive job is enabled merely by merging draft documents.
- Every published retention/deletion promise has corresponding verified behavior or an accurately described manual procedure.
- Automated deletion, if approved, has tests for threshold boundaries, notification/grace state, cancellation, concurrent activity, retries, partial R2 failure, and minimum required audit retention.
- Account deletion tests cover authorization, revoked sessions, historical revisions, relationships, and whichever messaging/media features actually ship.
- Shared text, versions, dates, offline Flutter reading, public legal routing, and entry-point links remain covered by the existing legal tests.
- Acceptance tests cover web/mobile, email/Google, existing users, current document versions, and bypass attempts.
- Provider region, logging, and recovery claims have evidence, not assumptions inferred from source code.
- Report tests not run and environment blockers explicitly. Never imply source inspection is deployment verification.

## Instructions for the next agent

The frontend draft implementation is authorized. It is not authorization to implement the remaining phases. Individual post deletion is now selected: a 7-day Trash/restore window followed by cleanup within another 7 days. The owner requested an implementation plan and said they probably will not add backups while starting. Produce the plan now, defer added backup implementation/cost research unless needed to explain an existing provider setting, and preserve mandatory verification of current recovery and deletion behavior. No implementation or purchasing is authorized. Verified export during the account-deletion cancellation window is approved; it does not extend deletion and generated archives are removed when permanent cleanup begins. On cancellation, restore previously valid public links only if current permissions allow; never revive independently revoked links. Material terms changes normally receive 30 days' advance notice and explicit new-version acceptance, with explained urgent legal/security exceptions. Suspected underage accounts get initial human review before any warranted temporary restriction, with a way to challenge mistakes; no automatic suspension from raw reports. App-controlled routine diagnostic/security logs have an approved maximum retention target of 30 days, with documented, reviewable incident exceptions. Abandoned server uploads are approved for cleanup after 7 days if present, without introducing upload-on-selection or background draft uploads. Generated export downloads expire 24 hours after becoming ready and must be deleted after expiry. Export scope is selected: the user's account/profile, journals including revisions and private notes, retained uploads, and retained messages they authored, subject to current authorization. Received message bodies and secrets are excluded. New Zealand law is selected as the drafting basis, preserving mandatory overseas rights and subject to legal review. The owner will monitor requests and coordinate incidents, with a backup team member still to be nominated before launch. The owner selected public registration after launch safeguards, rather than an invited-only pilot. Age declaration is selected: ask users to confirm they are at least 16 without routinely collecting birthdays or identity documents. Explicit server-recorded agreement is selected for new users and for existing users on their next visit after the first approved terms launch, with policy reading, sign-out, and deletion available without agreement. The owner's latest recovery direction supersedes earlier cost-comparison language: they probably will not add backups while starting. Do not start backup cost research, purchase or enable recovery services, or disable provider safeguards. Inventory existing Neon and R2 recovery behavior, document permanent-loss risk, and leave recovery enhancements for a later owner decision. Previously valid public links may reactivate on cancellation only under current permissions; independently revoked links remain revoked. The owner chose to hide profiles and journal posts immediately when deletion is requested and disable sharing. Conversation retention is decided: delete the conversation during the last participant's cleanup once neither participant remains and cancellation windows have expired. Active-system cleanup is targeted to finish within 7 days after the 7-day cancellation window, at most 14 days from the verified request. The owner chose an in-app Delete account flow, immediate normal-access restriction, no automatic inactivity deletion, and retention of sent messages in recipients' conversations under a "Deleted account" label. Detailed cancellation authentication, Trash/account-deletion interaction, and narrowly scoped retention exceptions remain implementation-design and legal-review items. Do not silently choose a retention figure, enable deletion, add backups, mark documents approved, set an effective date, or change auth acceptance semantics.

Before any further implementation, verify provider regions, recovery features, analytics settings, the responsible operator identity, and the contact-monitoring arrangement. Do not commit, push, or create another PR unless requested.
