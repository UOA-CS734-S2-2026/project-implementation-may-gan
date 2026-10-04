---
title: Environments and deployment
description: Prepare, run, verify, and recover Dayli releases without separating code, schema, or browser configuration.
---

# Environments and deployment

A deployment copies software somewhere it can run. A release is the wider decision: it selects a reviewed commit, confirms its configuration and schema, deploys the parts in a safe order, and records what was actually checked.

Dayli currently has local development and a deployed staging application. The repository does not contain a production application release workflow. Do not turn the production option in a database workflow into an imaginary production runbook.

Staging is a coordinated release. The API, database schema, web bundle, and browser proxy mode must agree. Deploying one half independently can produce a polished web page that calls the wrong origin or an API that expects a schema the database does not have. Dayli's workflow therefore deploys and proves the API before it builds the web app at the same commit.

For the names and destinations of staging settings, read [Environment configuration](/docs/operations/environment-configuration). For local environments, read [Environments](/docs/development/environments).

## What each environment proves

An environment is a boundary for code, configuration, credentials, and data. Passing in one boundary says nothing automatic about another.

| Evidence | What it proves | What it does not prove |
| --- | --- | --- |
| `pnpm verify:local` | The checked-out revision passes the repository's local suite with its isolated PostgreSQL fixture | Cloudflare, Neon, R2, OAuth, email, or the deployed site works |
| Coordinated staging release | The selected schema and API passed the workflow checks, then the web Worker deployed | Every product journey works, or the deployment is production-ready |
| Focused staging smoke | One named deployed journey worked at the recorded time | The whole application works, or the same revision is still deployed later |
| Manual device check | The recorded journey worked on that device and build | Other devices, providers, or later releases behave the same way |

Keep the revision with the evidence. A green result without its commit is a cheerful mystery, not useful release proof.

## Roles and approval boundaries

A change author prepares the code and evidence. A reviewer checks the change, migration risk, release mode, and recovery plan. A maintainer with access to the protected GitHub environment starts or approves the credentialed workflow and watches the result.

`main` requires pull requests and at least one approving review according to `CONTRIBUTING.md`. Hosted PR and push verification is currently paused there, so do not assume GitHub supplied automatic test gates. Run the required local suite and attach sanitized evidence to the approved record.

The staging jobs declare `environment: staging`, but workflow YAML cannot prove that GitHub required reviewers, deployment branches, stale-approval dismissal, or administrator bypass restrictions are configured. Inspect repository settings before a release. Record the setting review rather than claiming an approval gate exists because the word `environment` appears in YAML.

All live operations belong in approved protected workflows. Do not copy database URLs, provider keys, or deployment commands into a local terminal.

## Release prerequisites

A release starts before anyone presses "Run workflow". Prepare one candidate with these checks:

1. **Reviewed commit.** The candidate is a full 40-character commit on `main`. An explicit historical commit must also be an ancestor of current `main`.
2. **Local evidence.** Run `pnpm verify:local`, or `pnpm verify:local:full` when the debug Android APK is part of the change. Record the commit and sanitized outcome. Follow [Testing](/docs/development/testing).
3. **Migration review.** If schema files changed, review the generated SQL, Drizzle snapshot, journal entry, Squawk findings, and any suppression record. Read [Database migrations](/docs/operations/database-migrations).
4. **Environment inventory.** Confirm the required setting names and provider resources through metadata, without reading secret values. Check complete provider tuples and the exact staging origins in [Environment configuration](/docs/operations/environment-configuration).
5. **Release mode.** Confirm `STAGING_BROWSER_PROXY_ENABLED` is exactly `true` or `false`. Register both expected Google callbacks before changing proxy mode. The value is captured once for API and web.
6. **Recovery choice.** Identify the last coherent release commit and compare its migration history with staging. An older commit is not a rollback candidate when its schema hashes no longer match the database.
7. **Approvers and timing.** Confirm who can approve the protected environment and who will inspect a failure. Do not start a schema change and wander off for lunch.

Configuration name presence is not provider health. A correctly named revoked key still fails. Use the owning workflow's preflight and a focused post-release check.

## Run the coordinated staging release

The only staging application entry point is **Deploy coordinated staging release**, defined in `.github/workflows/staging-release.yml`. Its reusable API and web workflows have no independent dispatch trigger.

A successful CI run on current `main` can start it automatically. A maintainer can also dispatch it from `main`:

- Leave `commit_sha` empty for a normal forward release of current `main`.
- Supply an exact reviewed 40-character `commit_sha` only to restore a historical commit. That selects `rollback-verify-only` migration mode.

The workflow performs this sequence:

```text
Capture release commit, trusted tooling commit, and proxy mode
  -> verify direct migrator and Hyperdrive target the same Neon database
  -> check and plan the captured migration history
  -> apply a reviewed pending suffix for a forward release
  -> verify exact ordered migration hashes
  -> validate resources and dry-run API configurations
  -> synchronize the reviewed API secret allowlist
  -> deploy the API Worker
  -> run the private Hyperdrive proof
  -> build web with the captured public origins and proxy mode
  -> deploy web at the same release commit
```

The API proof checks the deployed Worker-to-database path, transactions, selected constraint classes, restricted role permissions, fresh-invocation visibility, and cleanup. Its sanitized artifact is retained for 90 days. This is stronger than a successful deploy command, but it is still not a browser journey.

The web build compiles `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_WEB_API_BASE_URL`, and `NEXT_PUBLIC_WEB_API_PROXY_ENABLED`. They are public build-time inputs. Changing a GitHub variable after deployment cannot repair an existing bundle.

The workflow is ordered, not transactional. If the API stage fails, web does not deploy. If web fails after API succeeds, the new API remains active with the old web. Stop and assess compatibility before retrying. Do not deploy web separately to make the run look complete.

## Verify the release

Read the workflow from the first failed or skipped step, not just its final badge.

For a completed run, record:

- release commit and workflow run;
- captured proxy mode;
- migration plan and exact verification outcome;
- API deployment and Hyperdrive proof outcome;
- web build and deployment outcome;
- the focused smoke or manual journey used afterward;
- anything not checked.

Use the [staging and manual checks guide](/docs/development/testing/staging-and-manual-checks) to choose a focused journey. Authentication has a protected [synthetic test](/docs/development/testing/synthetic-testing). Media and messaging need their own checks because an auth smoke does not touch R2, WebSockets, outbox delivery, or FCM.

The release attribution artifact records the release and automation SHAs for one day. The authentication smoke can associate itself with its triggering release, but it still reports the deployed revision as unverified. Do not upgrade that attribution into proof that no later deployment occurred.

## Restore an earlier application release

Rollback means restoring a previously reviewed coherent application version. Dayli migrations are forward-only, so rollback does not mean reversing SQL.

1. Find the prior release commit and its recorded proxy mode.
2. Compare its checked-in migration list and hashes with the current staging ledger through the approved workflow. Do not query staging from a local shell.
3. Restore `STAGING_BROWSER_PROXY_ENABLED` to the prior reviewed mode if it changed.
4. Dispatch **Deploy coordinated staging release** from `main` with the exact historical `commit_sha`.
5. Let `rollback-verify-only` run the target and exact schema verification. It applies no migration.
6. Let the same workflow deploy API and then web. Retest the affected journey. A cookie-host change can require users to sign in again.

If staging contains a newer migration or a changed hash, verification stops the rollback. Do not delete ledger rows, run a down migration, reset staging, restore a backup merely to fit old code, or bypass the gate. Prepare a reviewed forward fix or select an application release compatible with the latest schema.

Secret synchronization and Worker deployment are not atomic. If synchronization fails partway through, stop. Compare expected source names with Worker secret names without printing values, identify what changed, and rerun only after review. Rotating `BETTER_AUTH_SECRET` is not a transport rollback and invalidates signed sessions.

## Documentation deployment is separate

Documentation uses `.github/workflows/deploy-docs.yml`, not the application release. After successful CI on a same-repository push to `main`, it compares `apps/docs/` with the last successful `docs-production` deployment. If docs changed, it validates, builds, and deploys `dayli-docs` through the protected `docs-production` environment.

A docs deployment does not migrate PostgreSQL or deploy the Dayli API or web app. Conversely, an application release does not prove that a newer documentation commit is live.

## Current limits

This runbook describes repository behavior observed on 4 October 2026. It does not assert that a recent staging release passed, that automatic authentication smoke runs are enabled, or that GitHub environment reviewers are currently configured. Check Actions and repository settings for current state.

There is no production application deployment procedure in this repository. Before one exists, the team needs separately reviewed infrastructure, protected configuration, migration and backup policy, observability, smoke journeys, and recovery ownership. Staging commands with a renamed target are not that procedure.
