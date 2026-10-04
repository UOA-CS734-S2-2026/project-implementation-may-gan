# Protected staging signup activation

`.github/workflows/staging-signup-activation.yml` is the only manual publisher for the approved staging signup legal records. It has no production input or production environment path.

## Preconditions

1. Merge the workflow and run a coordinated staging release for the current `main` commit. The release tags both deployed Workers with that immutable commit SHA.
2. Protect the `staging` GitHub environment with the required reviewers. Set its `STAGING_SIGNUP_ACTIVATION_APPROVED` variable to `all-staging-accounts` only for an approved activation window.
3. Dispatch the workflow from current `main` with `activate` and the exact confirmation phrase. It checks current `main`, the direct migrator and Hyperdrive target, and Cloudflare's active API and web Worker versions immediately before the database transaction.
4. The activation freezes `staging-release.yml`, `staging-hyperdrive.yml`, and `staging-web.yml` through the GitHub Actions API and waits for queued and active runs to finish naturally before its final Worker-SHA check. If they cannot drain, activation fails closed and the operator must recover the frozen workflows. This is deliberately fail-closed: after activation or rollback, an operator must re-enable all three workflows and perform a fresh coordinated release from current `main`.

The transaction inserts only the canonical approved `terms-v1` and `privacy-v1` records. It refuses different effective documents and verifies that no existing account received a Terms acceptance by inference. Existing accounts become `terms_blocked` until they use the authenticated legal-acceptance API with an explicit action.

The `rollback` operation is intentionally staging-only and destructive. It does not unpublish effective Terms, because doing so would let a historical API deployment bypass the database registration trigger. Instead, it removes sessions, password and social account records, one-use grants, registration intents, and verification records. This deauthorizes old credentials while preserving the database guard. Do not use it as a production procedure.

## Deployment-race boundary

The shared `staging-database-state-staging` concurrency group coordinates only workflow definitions that contain that group. GitHub reruns use their historical workflow definition, so an old web deployment would not be covered by that lock. The activation workflow consequently disables the coordinated caller and attempts to disable both reusable deployment workflows, waits without canceling for all queued and active runs to finish, then verifies the active API and web Worker SHA immediately before the database mutation. It fails if the freeze or final verification cannot be established.

This controls repository Actions deployment paths, not an administrator who deliberately re-enables a workflow or an out-of-band Cloudflare deployment. The database registration trigger remains the independent final guard: a stale API cannot insert a new user after effective Terms without consuming a verified registration intent. Treat any out-of-band deployment or failure to re-enable and freshly deploy current `main` as an operational incident, not as evidence that the concurrency group protected the activation.

## Remaining blockers

This workflow is a staging safety control, not a compliance determination.

- A real staging activation still requires a protected environment approval, an up-to-date coordinated release with both Worker tags, and manual end-to-end validation of email and Google signup plus the web and mobile existing-account acceptance flows. Validate an offline mobile session recovering without restart and an active mobile app when Terms become effective.
- The account deletion request route is deliberately disabled in `apps/api/src/app.ts`, and the web and mobile clients do not expose an account deletion flow. The Terms and Privacy Policy accurately state that deletion and physical purge are not verified. Worldwide registration should not be represented as satisfying deletion, retention, provider recovery, processing-location, or local legal requirements without separate review.
- Provider terms, processor agreements, jurisdiction-specific legal requirements, support coverage, incident response, and the operational ability to process access, correction, and deletion requests remain external review items.
