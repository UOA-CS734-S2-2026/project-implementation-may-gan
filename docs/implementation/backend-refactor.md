# Backend action-slice refactor implementation plan

Status: PR 1 implementation is in progress on `refactor/backend-action-slices`. The [backend architecture](../backend-architecture.md) records the target conventions and rationale. The [messaging handoff](messaging-implementation-handoff.md) is a separate feature implementation, not part of this behavior-preserving refactor.

## Two-PR delivery and parallel agent plan

Approved planning direction: two PRs, developed concurrently in separate Git worktrees. Execution still requires the user's explicit approval. Do not spawn implementation agents, create implementation branches/PRs, or enable Actions as part of this documentation update.

```text
Shared base commit
  -> Refactor worktree -> PR 1: structure -> test expansion -> approved CI restoration
  -> Messaging worktree -> new-style messaging + feature tests
       -> rebase onto the reviewed PR 1 branch -> PR 2 targeting PR 1
       -> merge PR 1 first -> retarget/rebase PR 2 onto main as necessary
```

Parallel development starts from the same recorded base. It is not initially a Git dependency stack. Once the foundation interfaces are available, rebase messaging onto the refactor branch and make its PR target that branch so its diff contains messaging only. After PR 1 merges, verify PR 2's base/diff and rerun checks, especially if PR 1 was squash-merged. Do not merge messaging first.

PR 1 contains R1 through R8: existing-backend refactor, regression/test expansion and mobile integration-test infrastructure, then owner-approved GitHub Actions restoration. Existing tests remain in use throughout; the dedicated expansion phase does not mean postponing all testing until the end. R8 does not authorize an automatic repository visibility change.

PR 2 contains messaging implementation and its backend, database, realtime, web and Flutter tests. Messaging tests are not a third PR. Images/groups retain their existing explicit blockers and provider/device evidence still gates push release.

### Commit structure

Both PRs must contain multiple focused, reviewable commits. Do not deliver either as one large implementation commit. Keep each commit buildable/testable where practical, include behavior-specific tests with the change they protect, and avoid unrelated generated-file or formatting churn.

Suggested PR 1 sequence:

1. Characterization tests and baseline route/contract inventory.
2. Typed session middleware and its focused tests.
3. Existing post/posting-day action slices and import/test updates.
4. Media and system action slices with preserved contracts.
5. Relationship action decomposition and shared locking tests.
6. Infrastructure placement and remaining registration/import cleanup.
7. Test-discovery/CI test wiring and mobile integration-test infrastructure.
8. Approved GitHub Actions trigger restoration and operational documentation.

Split larger pieces further when useful. Do not isolate all tests into the final commit: the later testing commits expand shared infrastructure and cross-layer coverage. Do not combine behavior changes with unrelated mass renames. Preserve the focused branch history during integration; any eventual squash-merge choice is separate and requires the owner's decision, not an assumption by the implementing agent.

PR 2's suggested commit sequence is in the messaging handoff. The two-PR requirement controls review/merge boundaries, not commit count.

### Ownership and integration boundaries

| Refactor agent | Messaging agent | Coordinated integration |
| --- | --- | --- |
| Existing backend slices and file moves | New messaging action slices and local route registration | API `app.ts`, `index.ts`, `env.ts` |
| Typed session middleware and actor contract | Membership/request/message policies | Auth lifecycle hooks and shared actor/session types |
| Exact existing relationship pair-lock extraction | Message transactions, schema, additive migrations | DB exports, migration journal and lock helper consumption |
| General test tooling/discovery and CI | Messaging tests and feature fixtures | Test configs, package manifests, lockfiles |
| Generic Flutter integration-test setup | Messaging screens/state, socket and push clients | Mobile app scope/router/session lifecycle |

Each agent owns a separate worktree and commits focused changes. Worktree isolation prevents accidental file overwrites, not semantic or merge conflicts. Do not cherry-pick both agents' versions of a shared helper. The orchestrator coordinates shared-file integration after the responsible owner supplies the reviewed interface/commit.

Before parallel implementation, freeze a small contract containing:

1. Session middleware factory, verified actor/session projection, and error behavior.
2. Feature route-registration signature and dependency injection convention.
3. Shared relationship-pair lock signature, exact key encoding/seed, and transaction ownership.
4. Action directories/filename conventions and HTTP versus infrastructure placement.
5. Test commands, unit/integration discovery patterns, and shared tooling ownership.

Keep that agreement in the PR descriptions or a short section in this plan. Do not silently treat an unreviewed future helper as already available. The messaging agent may develop registration functions and action-local tests first, then wire the shared composition root after the foundation lands. If a temporary test double is required, keep it test-only; never ship a second authentication or locking implementation.

### Orchestrator checkpoints

- Before starting: obtain explicit approval and the required named implementor selection, record the shared base, preserve current documentation changes, and assign worktree/file ownership.
- Foundation checkpoint: review the small auth/registration/locking/test interfaces before both agents depend on them. Communicate any change to both agents.
- Parallel checkpoint: run each worktree's relevant tests and check shared-file overlap. Do not assume clean Git merges prove correct behavior.
- Integration checkpoint: rebase messaging onto the refactor branch, resolve shared-file edits deliberately, and verify both PR diffs and all test discovery.
- Review checkpoint: review security, permissions, transaction races, native/web regressions and deployment configuration. Record external gates instead of reporting them as passed.
- Delivery checkpoint: present two PRs with commands/results, remaining gates and merge order. Repository publication, privileged workflow execution, deployment and merging remain subject to their own approval boundaries.

## PR 1 implementation status

Implemented on this branch:

- Typed `AuthenticatedActor` and injected `createRequireSession` middleware. Existing post, posting-day, and relationship routes now use it. Missing or invalid credentials return private 401 responses, and resolver failures return private 503 responses.
- The relationship pair advisory lock now lives in `@dayli/db`. It keeps the sorted length-prefixed key and hash seed `734`.
- Post creation, current posting day, media reservation creation and lookup, health, API docs, HTTP helpers, and provider adapters moved to the named paths used by this branch. URLs, operation IDs, and generated OpenAPI output are unchanged.
- Renamed repository integration tests are included by the Postgres Vitest config.
- Flutter has an `integration_test` dependency and a native fake-session navigation smoke test. It does not prove real API login. A real isolated API journey is blocked on owner-provided disposable Worker configuration and synthetic credentials. Hosted CI remains manual-only pending the documented approval gate.

Relationship actions own their route, operation service, and PostgreSQL mutation or query modules. Shared policy, snapshots, locking, error mapping, and the transaction composition stay in `relationships/shared`. `relationships.service.ts` is only a compatibility composition facade. Media creation and lookup register from separate action directories and share the request-scoped repository runtime. These are structural changes only.

## Goal and scope

Refactor the existing Hono backend to feature/action slices with action-prefixed filenames, optional meaningful service layers, explicit authentication middleware, and narrowly shared persistence/policy helpers.

Keep existing URLs, operation IDs, request/response shapes, authentication authority, permissions, transaction semantics, runtime configuration, and deployment behavior. This is not a database redesign, framework migration, RBAC implementation, or an opportunity to add messaging behavior while moving files.

Include existing application actions for posts, posting day, media reservations, relationships, health and API docs. Audit auth, permissions, provider adapters, test-contract routes and compatibility entrypoints, but retain intentional cohesive modules where an action split would be artificial. Do not create empty messaging directories during the refactor.

## Codebase context

- `apps/api/src/index.ts` currently delegates fetch requests to the app; preserve exports and runtime lifecycle.
- `apps/api/src/app.ts` provides `createApp` for injected tests/contract generation and `createAppForEnv` for configured dependencies. Preserve the DB-free default app.
- `apps/api/src/env.ts` defines bindings; do not require new external resources for this refactor.
- `features/posts/create`, `posting-days/current`, and `media/reserve` already approximate action slices but use generic filenames.
- `features/relationships/{route,service,postgres-store}.ts` groups multiple actions and needs deliberate decomposition.
- `features/relationships/postgres-store.ts` uses a canonical sorted length-prefixed pair key and `pg_advisory_xact_lock(hashtextextended(pairKey, 734))`. Changing that identity during extraction breaks serialization with other writers.
- `features/permissions` separates policy from Drizzle-backed checks. Keep it a reusable authorization module rather than inventing an endpoint around it.
- `features/auth/better-auth.ts` configures Better Auth; `features/auth/route.ts` mounts its routes. Preserve provider ownership and existing sign-in/link/recovery behavior.
- `lib/session.ts` returns a user projection from Better Auth; routes also use injected per-feature resolvers wired in `app.ts`. Consolidate without converting outages into invalid credentials.
- `packages/contracts/src/common` provides shared schemas, while feature-specific schemas live beside routes. `scripts/generate-openapi.ts` obtains the API definition from Hono registration.
- `apps/api/vitest.config.ts`, `vitest.postgres.config.ts`, and `vitest.hyperdrive.staging.config.ts` have distinct test/runtime responsibilities. Inspect explicit globs and import paths before renaming tests.

## Target action mapping

Every action directory uses its action name as the file prefix, for example `edit-message/edit-message.route.ts`. Do not add service/repository files unless they have work to own.

| Existing location | Target location under `apps/api/src/features` |
| --- | --- |
| `posts/create/` | `posts/create-post/` |
| `posting-days/current/` | `posting-days/get-current-posting-day/` |
| `media/reserve/` create handler | `media/reserve-upload/` |
| `media/reserve/` lookup handler | `media/get-reservation/` |
| `media/policy.ts` and common reservation operations | `media/shared/` with descriptive names |
| `relationships/` status lookup | `relationships/get-relationship/` |
| `relationships/` pending requests lookup | `relationships/list-friend-requests/` |
| `relationships/` request mutations | `send-friend-request/`, `accept-friend-request/`, `decline-friend-request/`, `cancel-friend-request/` under relationships |
| `relationships/` friendship/block mutations | `remove-friendship/`, `block-user/`, `unblock-user/` under relationships |
| Common relationship state/transaction behavior | `relationships/shared/` with narrowly named modules |
| `system/health/` | `system/get-health/` |
| `system/api-docs/` | `system/get-api-docs/` |

Prefix schema/service/repository/test names, but preserve public contract names where renaming would churn OpenAPI/generated clients. A folder rename does not rename a route or operation ID. Keep the exact registered operation inventory as the baseline.

## HTTP authentication target

Create `src/http/authenticated-actor.ts` and `src/http/require-session.ts`. Use a middleware factory with an injected resolver so routes/tests remain configurable and no real database is constructed during contract generation.

- Actor identity must come only from Better Auth cookie/bearer lookup.
- Set a typed Hono context actor and use explicit middleware in each protected `createRoute` definition.
- Document auth through OpenAPI security as well; metadata is not enforcement.
- Preserve 401 versus 503 behavior and private no-store headers, including early-return errors.
- Preserve trusted-origin and cookie-mutation protection. Do not add a bearer fallback that accepts invalid credentials.
- Public health, documentation, and Better Auth-owned endpoints remain explicitly public or provider-controlled as appropriate. Do not blanket-protect all `/api/*` paths.
- Existing resource authorization stays in services/transactions. Authentication middleware is not a substitute for ownership, block, membership or deadline checks.
- Do not implement `require-role.ts` without an actual approved role-restricted endpoint. Document the future hook only. The existing nullable role column is not authorization policy.
- If extending the actor to session ID/expiry for future sockets, use verified server values. Avoid making all existing fake resolvers supply invented session metadata. Prefer a narrow identity projection plus an extended verified-session projection where needed.

Middleware-before-validation can change whether an unauthenticated malformed request returns 401 or 422. Capture existing precedence, choose the intentional uniform policy with review, and document that narrow change rather than claiming perfect behavior preservation. No change may allow unauthorized access or invoke the operation before session validation.

## Service and persistence rules

1. Keep operation orchestration in a service where it enforces real policy or coordinates work. A simple authorized read can call a focused query directly.
2. Keep SQL/Drizzle implementation in action repositories or specifically named shared queries. Do not introduce a generic repository superclass.
3. Expose transaction capabilities explicitly. Mutable authorization must be checked under the same lock/transaction as the write when required by current behavior.
4. Share one implementation of the relationship pair lock. Extract to `packages/db/src/relationship-pair-lock.ts` and export it only if multiple features need it, otherwise initially keep a named relationship helper. Preserve encoding, seed, and transaction scope exactly.
5. Keep shared operations under the owning feature. Services should not import another action's HTTP handler, call their own API over HTTP, or open a second independent transaction accidentally through service reuse.
6. Separate infrastructure providers from action logic. Move existing Hyperdrive lifecycle helpers into `src/infrastructure/database`, R2 adapters into `src/infrastructure/media`, and session runtime adapters into `src/infrastructure/auth` when the split clarifies ownership. Update imports/tests in the same patch.
7. Keep errors typed at the operation boundary; HTTP status mapping stays in `src/http` or the route. Maintain sanitized error behavior without broad unrelated error redesign.

## Step-by-step implementation pieces

### R1: Baseline and guardrails

- Record the registered methods, paths, operation IDs, schemas, security declarations, statuses and runtime unavailable behavior.
- Run existing API, typecheck, database and contract-generation checks with available prerequisites. Report missing infrastructure honestly.
- Identify all imports of files to move, including `scripts`, package tests, Wrangler compatibility entrypoints, CI and test globs.
- Add missing characterization cases for current auth, no-store, public routes and relationship mutation semantics before splitting them.

Acceptance: a reviewer can compare route/contract behavior before and after; no new runtime dependency or schema migration.

### R2: Typed authentication middleware

- Add injected middleware and actor types, with credential/outage tests.
- Convert one protected action first and prove cookie/bearer behavior and middleware ordering with the pinned Hono/Zod OpenAPI versions.
- Apply to remaining application actions. Keep feature services framework-independent.
- Update `app.ts` dependency construction while preserving the DB-free app and unavailable-mode behavior.
- Keep Better Auth endpoints provider-controlled and preserve public route access.

Acceptance: every protected action rejects unauthenticated calls before invoking its service; 503 auth failure remains distinguishable from 401; no unintentional API schema drift.

### R3: Existing small action slices

- Rename post creation, current posting day and system actions to the target directories and action-prefixed filenames.
- Move existing colocated tests with modules and update discovery.
- Split media reservation creation/lookup without duplicating signing policy or provider configuration.
- Preserve all URLs, operation IDs, schema component names and idempotency behavior.

Acceptance: existing tests run under their new filenames; generated OpenAPI/clients are unchanged except reviewed intentional differences.

### R4: Relationship decomposition

- Split each public relationship action into its own contract/route/operation modules as appropriate.
- Keep a thin `relationships.routes.ts` registration module with no hidden business logic.
- Extract shared snapshot/transition/lock primitives with descriptive names. Avoid copying pair-state checks across actions.
- Reuse a single transaction for each mutation and preserve lock identity/order, quotas, block semantics and error mapping.
- Add action-specific route tests and retain real-Postgres concurrency coverage.

Acceptance: friend request transitions, friendship removal and both block directions match baseline behavior, including race cases.

### R5: Infrastructure and import cleanup

- Move shared HTTP concerns into `src/http` and provider adapters into `src/infrastructure` as described above.
- Keep auth and permission modules cohesive unless a concrete split improves ownership; document intentional exceptions.
- Remove old files after all imports migrate. Temporary forwarding exports may be used during a PR sequence but must not leave competing implementations.
- Update documentation source paths, test/build scripts and CI configuration affected by moves. Do not change deployment names, secrets or resource ownership.

Acceptance: no stale source imports or duplicate route registrations; compatibility entrypoints still typecheck; no new Cloudflare packages/services provisioned.

### R6: Regression and handoff

- Run the verification matrix below and record results.
- Confirm current architecture docs describe actual refactored paths, while future messaging docs remain explicitly proposed.
- Update messaging tickets or handoff paths if a target helper was renamed during implementation.
- Keep PR 1's existing-backend refactor/test/CI changes separate from PR 2's messaging feature changes. Develop them concurrently under the ownership plan, then integrate as a stack.

Acceptance: structural target met with explicit exceptions and test evidence, not just a passing compiler.

### R7: Mobile regression automation

After structural regression passes, add mobile test automation as follow-up commits within PR 1, not a third PR. Do not make these tests depend on messaging code that does not exist yet.

- Preserve the existing Linux Flutter CI checks: generated-client verification, Dart client analysis/tests, Flutter formatting/analysis/tests, and debug APK build.
- Run controller/unit and widget tests on each PR using `flutter_test`. Use fake API/socket adapters and clocks; these tests need no emulator. Cover existing session, account-switch, navigation, and API failure behavior affected by the backend refactor.
- Add Flutter SDK `integration_test` as a dev dependency in `apps/mobile/pubspec.yaml`, with real-app flows under `apps/mobile/integration_test/`. Start with implemented authentication and navigation against an isolated synthetic-data API. Do not run integration tests against production.
- Add an Android emulator integration job for main-branch or manual runs. Add a reviewed macOS/iOS simulator build and integration path for release checks when native configuration is available. Neither job currently exists in `.github/workflows/ci.yml`.
- Document the later messaging cases: pending/retry ID preservation, inbox/thread navigation, live delivery, reconnect recovery of edits/unsends, foreground/background transitions, account isolation, and notification tap routing. Implement these with the messaging feature, not as permanently skipped tests that imply coverage.
- Retain physical iOS/Android release checks for native credential behavior and FCM/APNs background/terminated delivery, permissions, token rotation, and cold/warm taps. Mocked providers and simulator tests do not prove real push delivery. FCM/APNs configuration and device evidence remain messaging release gates, not blockers for the structural refactor.

Acceptance: existing mobile checks still pass; at least one implemented app journey runs through the integration-test setup; job cadence, environment requirements and outstanding device gates are documented. Missing native tools or credentials are reported as blocked/unverified, not passing.

### R8: Review repository visibility and restore CI safely

This is an owner-approved operational follow-up, not authorization for an implementing agent to make the repository public automatically.

- The checked-in CI workflow is currently `workflow_dispatch` only to preserve shared private-repository Actions minutes. Changing repository visibility alone will not restore automatic triggers.
- Obtain course/team and repository-owner approval before any visibility change. Audit full Git history, issues, workflow logs/artifacts, credentials and private data before publication. Rotate any exposed secrets; deleting the latest copy is not sufficient.
- Review GitHub's current [Actions billing policy](https://docs.github.com/en/billing/concepts/product-billing/github-actions). Standard GitHub-hosted runners are free for public repositories. Larger runners remain billable; storage has separate allowances. Repository visibility is the relevant boundary, not whether the organization has a public profile.
- Do not promise a refund or quota reset for prior private usage. GitHub documents included minutes resetting with the billing cycle, not upon changing visibility. Confirm the owner's current plan, budgets and runner choices before enabling jobs.
- Once approved and budgeted, restore PR/push triggers for ordinary verification while retaining manual dispatch. Keep deployment and database migration workflows separately approved/protected; do not automatically enable every paused workflow.
- Use least-privilege workflow permissions, cancel obsolete branch runs, avoid duplicate push/PR work where possible, cache dependencies, and bound artifact retention. Untrusted PR tests must not receive deployment secrets or run privileged code via unsafe `pull_request_target` checkout patterns. Use disposable test databases and synthetic credentials.
- Re-enable fast backend and mobile checks first, then the R7 emulator/release cadence. Verify required branch checks match actual job names and that a PR produces the expected checks without deployment side effects.
- If visibility approval is withheld, retain the private repository and agree on a budgeted/manual/local verification plan instead. Do not disable meaningful tests or claim that privacy must be sacrificed for testing.

Acceptance: the owner records the visibility/budget decision, repository exposure is reviewed if applicable, approved CI triggers run successfully, and sensitive deployment workflows remain gated. No visibility change, workflow execution, or CI re-enablement was performed during this documentation task.

## Files to create, move, modify, or remove

Create the `src/http` typed auth files and their tests. Move action files according to the mapping. Create narrow `shared` helpers when factoring repeated invariants. Move existing provider adapters into `src/infrastructure` with their tests. Modify `app.ts`, route registration, imports, Hono context types, test configs, scripts and docs that reference moved modules. Update `packages/db/src/index.ts` only if exporting the shared lock helper.

For R7/R8, modify `apps/mobile/pubspec.yaml` and its lockfile as needed, add `apps/mobile/integration_test/` tests, and update `.github/workflows/ci.yml` or dedicated mobile integration workflows. Document local commands, synthetic test environment setup, and required native configuration without committing secrets.

Remove superseded source files only after import/behavior parity is established. Do not remove auth assets, compatibility fixtures, provider-owned endpoints, unrelated frontend code, or migration history. Do not add messaging tables or DO bindings in this refactor.

## Verification

Use existing Vitest for policy/service/route checks, Hono `app.request()` for HTTP, and real Postgres for repositories/transactions. Mock narrow operation interfaces, not Drizzle query chains. Keep Worker-specific checks in the existing Cloudflare integration when runtime APIs are involved.

```bash
pnpm --filter @dayli/api test
pnpm db:check
pnpm db:test:up
pnpm db:test
pnpm generate:clients:check
pnpm lint
pnpm typecheck
pnpm verify:local
```

Run the full local verification path when its required tools are available. Before and after generating clients, inspect the diff; a structural backend refactor should not produce broad generated API changes. API test config must explicitly include renamed `.repository.integration.test.ts` files in the correct database-gated suite and exclude them from unsuitable suites.

Required cases include invalid/expired session, resolver outage, cookie/bearer parity, unauthenticated malformed input ordering, all public endpoints, no-store errors, forged actor fields, hidden-resource denial, relationship lock races, idempotent post retries, reservation ownership, server-clock eligibility, rollback and least-privilege database access.

Web/Flutter feature implementation and new testing frameworks are not required for the structural moves in R1 through R6. R7 adds mobile integration-test infrastructure afterward. If HTTP semantics change intentionally, run the affected generated-client and client regression tests too. FCM/APNs physical-device checks belong to the messaging release, not the structural refactor. R8 restores CI only after the owner approves visibility/budget and workflow safety.

## Risks and open questions

- Tests can silently disappear when suffixes change. Treat test inventory/discovery as an acceptance criterion.
- Over-splitting can create import cycles or duplicate invariants. Use small owner-local shared modules and explicit transaction ownership.
- Auth middleware can change validation precedence or unavailable-mode behavior. Review these explicitly.
- Role policy remains unimplemented and out of scope; never infer privileges from a nullable column alone.
- Some provider/compatibility modules do not fit action slicing. Keep them as documented exceptions rather than inventing artificial services.
- The final set of optional service files is an implementor decision based on responsibility, not a fixed file-count requirement.
- Other agents may modify relationship or auth code concurrently. Coordinate file ownership and rebase small PRs; do not overwrite unrelated changes.

## Implementing-agent instructions

Read the architecture document first, then this plan. Recheck current paths/signatures for intervening changes, not a fresh architectural redesign. Execute R1 through R6 in reviewable pieces, then R7 mobile automation and the owner-gated R8 CI follow-up. Do not change repository visibility without explicit owner approval. Preserve contracts and permissions, state all intentional behavioral differences, and stop to clarify unresolved security/product changes rather than disguising them as refactoring.

The user explicitly requested approval before orchestration. This documentation task does not authorize starting either implementation agent automatically. If the parent assistant later delegates implementation, it must obtain the user's implementor selection according to the session's agent-selection rules. No implementation agent was started here.
