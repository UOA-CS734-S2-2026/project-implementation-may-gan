# Staging authentication smoke tests

Status: the first hosted manual run, [36919168053](https://github.com/agroupforcoders/dayli/actions/runs/36919168053), failed with `browser_failure` after 5 ms. Scheduled and post-release execution remain disabled by default. No hosted rerun or scheduled monitoring has been enabled by this document.

The owner created a disposable staging account and reported adding `SMOKE_TEST_EMAIL` and `SMOKE_TEST_PASSWORD` as GitHub secrets. This work adds a small synthetic browser journey against the deployed site. It does not claim complete authentication security coverage.

Keep this document in `docs/implementation/`. Do not publish it through the docs application, navigation, or content synchronization yet. Preserve existing auth documents.

## Goal

Detect whether the deployed web-origin email/password login journey works. A health endpoint can succeed while session cookies, server guards, or the browser proxy are broken, so the smoke test must exercise an actual browser.

## First-version scope

Use one fresh Chromium browser context and the existing disposable account:

1. Open the public landing page.
2. Visit a protected deep link while signed out and verify the sign-in destination preserves the intended return path.
3. Sign in through the real email/password UI.
4. Verify the protected destination and query are preserved and meaningful authenticated content is available. A 200 response or arbitrary DOM element alone is insufficient.
5. Reload and confirm the session still works.
6. Open a second tab in the same context and confirm authenticated access there.
7. Inspect the relevant session cookie attributes in memory. Verify the expected Secure, HttpOnly, SameSite, hostname scope, and Path behavior against current configuration, without reporting values.
8. Log out and confirm protected access stops on subsequent navigation, including the second tab.

Use the normal application flow, without bypassing rate limits, altering user records, or adding a production test endpoint. No posts, messages, relationships, email resets, or account deletions are part of this suite. Any final cleanup may sign out only the session created by this run. It must not revoke unrelated sessions or change account settings.

## Explicit exclusions

- Signup, mailbox access, verification email delivery, and password-reset email tests.
- Automated Google OAuth sign-in.
- Real session expiry, refresh eligibility, and independent session revocation. These need separate timing/isolation work.
- Native app, WebSocket, and R2 smoke coverage.
- Changing staging session lifetimes or testing against production.
- Creating another monitoring service or external notification integration.

## Workflow design

Add a separate staging-only workflow with these entry points:

- Manual dispatch for initial validation and diagnosis.
- Hourly schedule away from the top of the hour.
- Completion of a successful coordinated staging deployment.

Scheduled and post-deployment execution must remain disabled by default until a manual staging run passes and activation is explicitly approved. Document the activation switch and the initial skipped state. Do not claim a workflow schedule provides precise timing or an uptime SLA.

All entry points must share one non-cancelling concurrency group so runs using this account do not overlap or interrupt each other's cleanup. Bound runtime and retries; never repeatedly submit credentials after a failure.

Use the `staging` environment, minimal GitHub permissions, and the two existing secret names. Fail safely when secrets are absent, without printing their values or the account email. Do not accept arbitrary target URLs, workflow refs, commands, or user-supplied destinations. The hosted target is exactly `https://staging.dayli.agroupforcoders.com`.

For post-deployment runs, validate the upstream workflow, repository, branch, event, success conclusion, and release attribution before granting access to secrets. Do not execute untrusted pull-request code through a privileged `workflow_run` event. Inspect the actual release workflow and its captured release SHA rather than assuming the event's head SHA is the deployed application revision, especially for explicit rollbacks.

Read automation code from a trusted main revision and report that revision separately from the release revision being checked. If exact deployment attribution cannot be established, report that limitation rather than claiming a particular version was tested. A subsequent release may change the target during a run; detect or document that possibility.

## Safe reporting

Authenticated runs must not retain screenshots, video, traces, HAR files, HTML dumps, browser storage, or raw request/response bodies. Disable reporters and failure paths that expose raw Playwright errors, locator values, request URLs, browser logs, or filled form content. Redacting only the password is not sufficient.

Produce an allowlisted summary with fixed step labels, outcome, duration, and non-sensitive HTTP status or failure categories where relevant. No passwords, email addresses, cookies, tokens, authorization headers, reset links, or OAuth codes belong in logs or artifacts. Do not upload entire test output directories on failure.

Keep the process exit status failing when a step fails. Do not turn reporting failures, cleanup failures, or retries into a passing result. GitHub Actions notifications are the initial alert mechanism; they depend on repository/user notification settings. Repeated-failure escalation is not implemented merely by scheduling the workflow.

## Implementation and validation sequence

1. Inspect existing Playwright setup, sign-in/logout UI, session configuration, route guards, workflow release capture, and repository instructions.
2. Implement the isolated smoke runner and safe reporting with tests against local fixtures. Reuse existing dependencies where practical; do not modify local app E2E behavior merely to accommodate hosted credentials.
3. Add workflow contract tests for target restriction, trusted triggers, credential scope, concurrency, timeouts, and disabled automatic activation.
4. Add negative tests that simulate credential-bearing errors, failed login, redirects to an unexpected host, failed logout, and failed cleanup. Verify sensitive values never appear in generated output.
5. Run focused tests, lint/typechecks where applicable, and the required local verification suite. Obtain an independent correctness/security review.
6. Commit and propose the change through the normal review path. Prior direct-main permission for a documentation-only task does not authorize bypassing review for this implementation.
7. Perform a manually approved staging run using GitHub's stored secrets. Do not attempt to retrieve secret values through GitHub or ask the owner to paste them into chat.
8. Enable scheduled/post-deployment execution only after that run passes and the owner approves activation.

## Implemented controls and activation

The implementation is in `.github/workflows/staging-auth-smoke.yml`, `apps/web/scripts/staging-auth-smoke.mjs`, and the local contract/privacy tests in `scripts/staging-auth-smoke.test.mjs`. The workflow installs Playwright Chromium with its Linux dependencies immediately before the credentialed smoke step. The runner hard-codes `https://staging.dayli.agroupforcoders.com`, starts one headless Chromium context, blocks requests leaving that origin, and does not configure screenshots, video, tracing, HAR, storage state, or a Playwright reporter. Its only output is allowlisted fixed labels with outcome, duration, and a fixed failure category. It never prints caught browser errors, locator details, request URLs, or secret values.

The journey checks the signed-out deep-link return path, UI password sign-in, preserved settings query and Settings heading, reload, another same-context tab, the in-memory host-only session-cookie attributes, UI sign-out, and subsequent denied protected navigation in both tabs. If a failure occurs after sign-in, cleanup attempts one UI sign-out for this context only. The unexpected-origin tracker uses one immutable baseline before the journey begins and one fresh baseline before cleanup begins. Every asynchronous journey helper, locator wait, phase end, cleanup action, and closure check compares against its phase baseline. A historical blocked external request therefore preserves the journey failure without suppressing fixed-origin cleanup. A new external request during cleanup remains blocked and makes cleanup fail. Cleanup failure keeps the run failed.

Manual dispatch has no inputs and is limited to `main`. It may run while automation is inactive. The hourly cron at minute 17 and the successful `Deploy coordinated staging release` completion path run only when the repository-level Actions variable `STAGING_AUTH_SMOKE_AUTOMATION_ENABLED` exactly equals `true`. It must be a repository Actions variable because job conditions are evaluated before staging environment variables are available. The credentials remain `staging` environment secrets. The activation variable is intentionally absent or false initially. Do not set it until an owner has inspected a successful manual run and explicitly approved activation. Scheduling is best-effort GitHub Actions timing, not an uptime SLA.

The post-release path accepts only a successful same-repository, `main`-branch `Deploy coordinated staging release` whose own event is the approved dispatch or main CI completion path. The coordinated release writes a one-day, non-sensitive artifact containing its captured application release SHA and automation SHA. The smoke workflow checks out trusted current `main`, downloads only that artifact from the validated upstream run, validates its exact two-SHA format, and reports its automation revision separately from the triggering release revision. It explicitly reports `deployed_revision=unverified`: the artifact proves which successful release triggered this run, not which revision remains deployed when the browser starts or finishes. A concurrent or intervening release can change staging during the smoke run. No application release marker is added by this work. A manual smoke run likewise reports the triggering release as unavailable and the deployed revision as unverified. Neither path accepts a target URL, command, ref, or other user input.

## Evidence to record as work proceeds

The hosted manual run [36919168053](https://github.com/agroupforcoders/dayli/actions/runs/36919168053) installed dependencies but had no Playwright browser-install step, then reported `browser_failure` in 5 ms. That category and duration strongly point to missing Chromium provisioning. The raw browser error is intentionally suppressed by the runner's safe reporting, so it is not retained as evidence. A hosted rerun remains pending after this fix.

Local validation for this repair passed: `pnpm test:staging-auth-smoke-contract` passed 9 default-journey, privacy, cleanup, and workflow-contract tests, including the browser-install ordering check; `pnpm test:staging-release-contract` passed 22 tests; and `pnpm lint` passed. Chromium launched and closed locally without credentials using the smoke runner's production environment allowlist. `MIGRATION_BASE_REF=7e2f29fa070cb252fd39fa166960f1f2e1e06d55 VERIFY_POSTGRES_PORT=55433 pnpm verify:local:full` also passed. The immutable ancestor is this branch's direct parent, and the verification uses only an isolated local PostgreSQL fixture. This is local-only evidence, not a hosted authentication-smoke result.

- Implementation commit and test commands/results.
- Independent review findings and resolutions. No independent review was performed in this implementation worktree because the owner explicitly required the selected implementor to make the change without further delegation. Obtain normal PR review before merge.
- Workflow and report locations.
- Manual hosted run URL, automation revision, release attribution, and sanitized result.
- Whether automated execution is still disabled or has been enabled with approval.
- Remaining gaps, including email delivery, actual expiry, independent revocation, and post-release compatibility outside browser password auth.

## Related records

- [Auth proxy design and validation](auth-proxy-design-and-validation.md)
- [Auth proxy migration history](auth-proxy-migration-record.md)
- [Staging deployment runbook](staging-deployment.md)
- [Browser proxy verification](browser-proxy-verification.md)
