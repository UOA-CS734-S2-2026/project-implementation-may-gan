# Privacy Policy and Terms of Service implementation plan

Status: proposed, awaiting user approval. Planning only. No application code has changed.

## Scope

Add Privacy Policy and Terms of Service pages to Dayli web and native Flutter apps. Users must be able to read them before creating an account, after signing in, and without a working API connection. Flutter will bundle the documents for offline reading.

This task does not implement account deletion, data exports, messaging, media uploads, a consent database, or a cookie banner. Those features need their own approved work. Legal copy must not imply that unfinished features already work.

Approval of this plan permits implementation planning choices, not publication of unreviewed legal terms. The operator must approve the final text and resolve the publication blockers below. Qualified legal review is recommended before public release.

## Evidence and dependencies

Read these again at implementation time because other work is in progress:

- `docs/implementation/implementation-reference.md`
- `docs/implementation/messaging-implementation-handoff.md`
- `docs/implementation/backend-refactor.md`
- `docs/dayli/product-decisions.md`
- `docs/dayli/security.md`
- `docs/dayli/media-reservations.md`

Treat source code as evidence of implementation, not proof of deployed configuration. The messaging handoff explicitly distinguishes approved direction from proposed defaults and unimplemented behavior. Do not convert its future-tense requirements into present-tense policy promises.

### Data disclosures to verify

| Area | Evidence and current or planned distinction | Policy treatment |
| --- | --- | --- |
| Account and authentication | Better Auth integration and database schema hold identity, credentials or provider associations, sessions, and verification records. Review `apps/api/src/features/auth/` and `packages/db/src/schema/`. | List the actual fields and purposes, distinguish password hashes from plaintext passwords, and explain optional Google sign-in. Verify session metadata and provider token storage. |
| Posts and relationships | Post content, audiences, revisions, tomorrow notes, friendships, and blocks are defined in the database and API. | Explain who can read content, release timing, and that editing a post can retain earlier versions. Do not equate a public profile with a public journal. Verify each enabled feature. |
| Media | Reservation code exists. Security documentation says upload validation, attachment linking, and private downloads are unfinished. | Describe only the released flow. Coordinate R2 disclosures with the upload owner. Do not promise complete media deletion or private download behavior without verification. |
| Database and infrastructure | Product decisions select Neon PostgreSQL and Cloudflare Workers/Hyperdrive. Production deployment is not established by that document. | Confirm actual providers, production regions, access, logging, and international processing before publication. |
| Email | Auth includes a Resend adapter. | Confirm whether it is enabled and which account/recovery data it receives. Better Auth is software, not automatically a separate hosted data recipient. |
| Browser storage | `apps/web/lib/auth/client.ts` uses credentialed requests; `apps/web/lib/theme/provider.tsx` stores a theme preference locally. | Explain session cookies and theme storage. Inventory any other deployed trackers before making analytics, advertising, or sale/sharing statements. |
| Mobile storage | `apps/mobile/lib/auth/native_session.dart`, `session_controller.dart`, and `drafts/draft_store.dart` use protected native storage for sessions, cached identity, and drafts. Sign-out attempts to remove the user's draft and credentials. | Explain device-held drafts and credentials separately from server data. Do not imply the contents are end-to-end encrypted or that uninstall reliably clears every platform backup or temporary file. |
| Mobile permissions and temporary files | Review `apps/mobile/lib/compose/media_picker.dart` and platform manifests during implementation. | Disclose only actual photo/video/camera permissions and temporary storage behavior. Do not add generic location, microphone, contacts, or biometric claims without evidence. |
| Messaging and push | The handoff proposes PostgreSQL messages, read state, reactions, body-free outbox/change records, socket metadata, and FCM/APNs registrations. Messaging is not implemented in the reviewed baseline. | Prepare a separate release checklist for messaging text. Explain server-readable messages, unsend tombstones, device tokens, generic push defaults, and retained history after blocking only when confirmed and released. Do not advertise end-to-end encryption. |
| Retention and deletion | Product decisions specify immediate application inaccessibility and up to 30-day backup expiry as intended behavior; cleanup is planned. | Verify actual account/post deletion entry points, operational cleanup, and backup settings. Do not publish a guaranteed 30-day purge or functional self-service deletion based on a plan alone. |

The final policy needs an internal claim checklist with source references and owner confirmation for deployment facts. Draft sections for future functionality stay outside the published document until release review.

### Completed source review

Read-only reconnaissance confirmed these additional details. No deployment, build, or runtime verification was performed:

- `packages/db/src/schema/index.ts` defines session IP addresses and user agents, provider credential/token fields, verification records, and persistent rate-limit state. Include these in the data inventory rather than describing collection as only name, email, and posts. Confirm which optional fields are populated in production.
- `apps/api/src/features/auth/better-auth.ts` enables email/password login without requiring email verification. Password reset tokens expire after 15 minutes and a reset revokes sessions. Do not describe every account as email-verified.
- `apps/api/src/features/media/reserve/` and `apps/api/src/lib/r2.ts` implement authenticated reservations and signed PUT URLs. Client integration, upload completion, actual-format validation, attachment linking, downloads, and orphan cleanup remain unfinished. An expired reservation is not evidence that its row or uploaded object was deleted.
- No complete account deletion route/workflow, general retention job, operational backup expiry proof, or log-retention policy was found. These are publication decisions and implementation dependencies, not capabilities this legal-page task can promise.
- No messaging implementation exists in the reviewed baseline. Keep FCM/APNs, Durable Object metadata, message retention, tombstones, and notification disclosures on the release checklist until that work ships.
- Provider contracts, administrator access, incident handling, change notices, and retention exceptions require owner confirmation. Source inspection alone cannot establish them.

## Proposed user experience

### Web

- Public `/privacy` and `/terms` routes under a new `(legal)` route group, outside the authenticated `(main)` group.
- A shared legal layout with the Dayli identity, document title, effective date, readable column width, section links, and links between both documents.
- Use existing theme tokens and Epilogue/Spectral typography. Keep the page simple, with no decorative motion or new design dependency.
- Add links on the landing page, auth layout, and Settings. Keep auth links visible without nesting interactive elements inside submit buttons.
- Static/server-rendered document content with route-specific metadata. Do not wait for a session request to render the text.
- Semantic headings, visible focus, keyboard navigation, sufficient contrast, mobile wrapping, and print styles scoped to legal pages.
- Verify the landing page's full-height artwork does not cover legal links on small screens.

### Flutter

- Native, scrollable `/privacy` and `/terms` screens, not a WebView or a browser-only substitute.
- Bundle the same approved document text so reading does not require a session, network connection, or installed browser.
- Add links to welcome, sign-in/sign-up, and Settings screens. Preserve partially completed auth fields when returning from a legal screen.
- Register legal routes outside `AppShell` and permit them during unknown, signed-out, and signed-in session states.
- Important router detail: `apps/mobile/lib/app/router.dart` redirects signed-in users away from every current public location, and redirects unknown sessions to the splash screen. Adding legal routes to `_publicLocations` alone is insufficient. Handle legal locations before that session switch while preserving existing auth redirects.
- Back navigation pops to the previous screen when possible. Direct entry falls back to an appropriate welcome/home/splash route without trapping the user.
- Use `DayliColors`, `DayliText`, safe areas, selectable text, accessible heading semantics, generous link targets, and large-text support. Document links navigate natively.
- Display the bundled version/effective date. Update the mobile bundle when terms change; do not silently present an older bundled copy as the latest web policy. Any future mandatory reacceptance or remote document update mechanism is separate scope.

## Shared content approach

Proposed default for approval: one structured JSON source for each document in a small workspace package, `packages/legal-content`.

Each document contains a stable ID, title, version, approved effective date, summary, and ordered sections with stable IDs. Allow only the block types needed for paragraphs, lists, and links. Do not accept arbitrary HTML or executable markup.

- Web imports the JSON through an explicit workspace dependency.
- A deterministic script copies the canonical JSON files into `apps/mobile/assets/legal/` for Flutter asset bundling.
- A check mode fails if mobile assets differ from the canonical source. Integrate it with existing verification scripts, coordinating shared `package.json` or workflow edits with the other owners.
- TypeScript and Dart renderers validate the supported structure. Flutter shows a readable error rather than crashing if a document asset is invalid.
- Both clients render the same wording, section IDs, effective date, and version. No hand-maintained second copy and no runtime legal-content API.
- Keep unapproved drafts visibly marked during development. Block production publication on unresolved placeholders or unapproved status. Do not invent an effective date.

This adds a small amount of shared-content tooling but avoids legal text drifting between TypeScript and Dart. No database migration or generated API-client change is needed.

## Document outlines

### Privacy Policy

1. Who operates Dayli and how to contact them.
2. What Dayli collects, including account details, user content, relationships, auth/session information, and supported local device storage.
3. Why the data is used, such as authentication, providing posts, security, and account emails. Add region-specific legal bases only after jurisdiction review.
4. Who can see posts and notes, how revisions work, and the limits of blocking, sharing, and recipients' saved copies.
5. Service providers and cross-border processing, limited to confirmed providers and regions.
6. Cookies, browser storage, native protected storage, and actual mobile permissions.
7. Retention, deletion, and backups, using verified operational behavior rather than target architecture.
8. Available access, correction, deletion, and complaint channels. Do not claim an export button or self-service deletion tool exists if it does not.
9. Security and its limits, including server-readable content and no absolute confidentiality guarantee.
10. Age eligibility, changes to the policy, and contact details.

### Terms of Service

1. Operator, scope, eligibility, and how the terms apply.
2. Account responsibilities and sign-in security.
3. User ownership of content and the limited permission Dayli needs to store, process, and display it. No unnecessary ownership transfer or AI-training permission.
4. Acceptable use, prohibited abuse, and the actual way to report concerns.
5. Post visibility, revisions, sharing limits, and feature rules that are currently available.
6. Suspension, termination, and deletion, matching actual operator procedures.
7. Third-party services and service availability without unverified uptime promises.
8. Warranty and liability terms reviewed for the applicable law and mandatory consumer rights.
9. Governing law, disputes, changes, and contact information after operator approval.

Do not insert paid subscriptions, automatic renewal, arbitration, a minimum age, or a jurisdiction by guessing.

## Acceptance and consent boundary

Provide links before both email registration and Google sign-in, including Google sign-in on a sign-in screen because it may create a new account.

Proposed scope is document access plus owner-approved explanatory copy. A Privacy Policy is a notice, not blanket consent to unrelated processing. Do not add a checkbox that falsely suggests the API records acceptance, and do not claim that displaying links alone proves enforceable agreement.

If the operator requires recorded terms acceptance, plan it separately across web, native, email signup, and OAuth account creation. It requires server-side document version/time records and an agreed treatment of existing users. That is a backend/auth contract change and must be coordinated with the ongoing refactor.

## Implementation sequence

1. Recheck the current branch and in-progress plans. Record which features are actually shipping and create the claim checklist.
2. Resolve owner publication decisions and draft both documents. Review copy before treating it as final.
3. Add shared document files, validation, deterministic mobile asset generation, and parity checks.
4. Add web routes, layout, navigation links, metadata, and scoped styles.
5. Add Flutter models/rendering, bundled assets, public routes, and navigation links.
6. Test both clients and review every disclosure against the shipping backend and provider configuration.
7. Obtain final content approval and set approved version/effective dates. Publish the public web URLs and ship matching mobile assets.

Parallel-work boundary: this plan owns legal documents and legal UI. Do not modify messaging policy, storage behavior, generated clients, auth contracts, or cleanup jobs. Coordinate edits to Flutter router/auth/Settings files, web auth/Settings files, manifests, and root tooling because the messaging/refactor work may touch them too.

## Proposed files

New:

- `packages/legal-content/package.json`, document schema/types, and `privacy.json` / `terms.json`.
- `scripts/sync-legal-content.mjs` with write and check modes.
- `docs/implementation/legal-content-review.md` for claim evidence and publication approvals.
- `apps/web/app/(legal)/layout.tsx`.
- `apps/web/app/(legal)/privacy/page.tsx` and `terms/page.tsx`.
- `apps/web/components/legal/LegalDocument.tsx` and `LegalLinks.tsx`.
- `apps/mobile/lib/legal/legal_document.dart`, `legal_document_screen.dart`, and `legal_links.dart`.
- `apps/mobile/assets/legal/privacy.json` and `terms.json`, generated from canonical files.
- Focused content-parity and Flutter legal/router tests.

Existing files to update:

- `apps/web/package.json`, landing page, auth layout, sign-up/sign-in copy as approved, and Settings.
- `apps/mobile/pubspec.yaml`, router, welcome screen, auth screens, and Settings.
- Root `package.json` and lockfile for workspace dependency and legal verification commands.
- Existing CI only as needed, coordinated with its current owner.

Confirm exact file names after approval and a fresh checkout review.

## Verification and acceptance criteria

- `/privacy` and `/terms` load directly on web without authentication and remain readable if the session API fails.
- Flutter legal routes work during session loading, signed out, and signed in. No unexpected splash/home redirect, lost auth form state, or back-navigation loop.
- Flutter reads bundled documents offline. Both apps show matching titles, wording, versions, and dates.
- Links work from all proposed entry points, and each document links to the other.
- Test narrow web viewports, large text, keyboard-only use, screen-reader headings, all existing themes, and legal-page printing.
- Documents contain no placeholder operator/contact/date values, unsupported feature promises, or claims of end-to-end encryption.
- Validate JSON schema, stable/unique section IDs, supported links, mobile asset parity, and production approval status.
- Run `pnpm --filter @dayli/web lint`, `pnpm --filter @dayli/web typecheck`, and `pnpm --filter @dayli/web build`. Check the deployed web adapter as required by the existing delivery workflow.
- From `apps/mobile`, run `flutter analyze` and `flutter test`, including new legal document and router cases. Perform an emulator/device navigation and offline smoke test.
- Use the existing browser QA tooling for web checks. If no browser test suite exists, record manual evidence rather than claiming automated coverage.
- Report any environment-blocked checks explicitly.

## Owner decisions before publication

These can be resolved during copy review rather than blocking approval of the page architecture:

- Legal operator identity, privacy/support contact, and any required business address.
- Intended users and countries, age eligibility, and applicable law. Auckland scheduling and course affiliation do not establish these.
- Course/pilot versus public production use, the release feature set, and whether user data supports any research or teaching activity.
- Actual production providers and hosting regions, telemetry/analytics, advertising, sale/sharing, and any external AI processing.
- Retention by data category, verified backup expiry, deletion/access/correction request handling, and realistic response procedures.
- Whether registration needs an explicit, server-recorded terms acceptance workflow.
- Who reviews and approves legal wording, document versions, and effective dates.

## Approval request

Approve or revise the web and native Flutter scope, shared bundled content approach, and separation of legal pages from backend consent/deletion work. After approval, select `implementor-terra` or `implementor-luna` before implementation begins.
