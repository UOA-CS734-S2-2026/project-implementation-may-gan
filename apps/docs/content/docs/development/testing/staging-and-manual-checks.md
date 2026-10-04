---
title: Staging and manual checks
description: Use Dayli's reviewed GitHub workflows when a check needs deployed Cloudflare or Neon resources.
---

# Staging and manual checks

Staging checks test the application in its deployed test environment. Manual checks are performed by a person, who follows a feature's steps and records the result rather than relying only on an automated script.

These checks matter because working on our computers doesn't guarantee that the deployed app works too. Hosting settings, credentials, and external services can differ. A person can also notice confusing interactions or device-specific problems that our automated checks don't cover.

Dayli uses protected GitHub workflows to check the deployed API's connection to its staging database. We also use recorded manual checks for features such as mobile uploads and native sign-in when a local test cannot establish the deployed or device behaviour. A successful check is evidence for that specific feature and revision, not the entire app.

Credentialed automated staging checks belong in the repository's dedicated workflows, which keep secrets in the GitHub `staging` environment. Do not copy their commands into a terminal with live secrets. For a manual feature check, record the steps, result, deployed revision if known, and any limitations.

## Where Dayli uses these tests

Dayli's deployed staging proof is split across a few sources:

- `.github/workflows/staging-release.yml` is the coordinated staging release entry point. It captures one reviewed commit and deployment mode, deploys the API first, then deploys the web app at the same SHA.
- `.github/workflows/staging-hyperdrive.yml` verifies the schema target, applies reviewed staging migrations when required, deploys the API Worker, and runs the remote Hyperdrive proof.
- `apps/api/test/__tests__/hyperdrive.staging.test.ts` checks a query, transactions, constraints, role permissions, fresh-invocation visibility, and cleanup through the deployed staging Worker binding.
- `.github/workflows/staging-web.yml` builds and deploys the staging web application for the captured release.
- `.github/workflows/staging-auth-smoke.yml` runs the deployed browser authentication journey described in [synthetic testing](./synthetic-testing).
- `.github/workflows/verify-staging-export-worker.yml` checks that the separate restricted export Hyperdrive points to the expected staging database through the `lifecycle_worker` role. It does not enable exports.
- `.github/workflows/run-database-migrations.yml` is a separate manual migration workflow with explicit target and production safeguards. It is not a general application release workflow.

Local workflow contract checks live in `scripts/staging-release-contract.test.mjs`, `scripts/verify-staging-schema-target.test.mjs`, and related `scripts/staging-*.test.mjs` files. They check the automation rules without contacting staging.

## What you can run safely while developing

Use the local contract suites when changing staging automation:

```bash
pnpm test:staging-release-contract
pnpm test:staging-auth-smoke-contract
```

These commands use local fixtures. Despite `staging` in their names, they do not deploy, read GitHub environment secrets, or contact the hosted application.

The actual staging commands are intentionally inside GitHub Actions. Run them from the reviewed workflow on `main`, with the appropriate environment access and approval. This guide does not provide a local credentialed command.

## Coordinated release proof

A staging release needs more than a successful deploy command. The API schema, Worker, and web app must agree on the release being checked.

`Deploy coordinated staging release` captures the commit SHA, migration mode, browser-proxy mode, and trusted tooling SHA before it delegates to the API and web workflows. The API workflow verifies that the direct database target matches configured Hyperdrive, checks the captured schema, deploys the Worker, and then runs `apps/api/test/__tests__/hyperdrive.staging.test.ts` with remote bindings.

The Hyperdrive test creates a unique group, verifies committed and rolled-back rows, checks PostgreSQL constraint classes, confirms the app role cannot perform forbidden updates or DDL, and checks cleanup from a fresh invocation. The workflow writes a sanitized JSON result and retains its artifact for 90 days. It does not retain database URLs or row values as evidence.

The release workflow also retains a non-sensitive attribution artifact for one day. The authentication smoke can use it to report which release triggered the run. That attribution does not prove that the same revision was still deployed when a later browser check started, so the smoke reports the deployed revision as unverified.

## Restricted export proof

Export has a narrower staging path than ordinary feature checks. The coordinated API deployment accepts the proof only when all four reviewed `STAGING_EXPORT_PROOF_*` values and the separate `EXPORT_WORKER_HYPERDRIVE` binding are present. Runtime code then limits requests, build claims, downloads, and cleanup claims to one named synthetic owner. The build window can extend no more than one hour, while cleanup stays active through the later operator review so a delayed archive cannot be left behind.

This path is not enabled by the general export constant, and neither checked-in client enables its export interface. A successful target check, local export test, browser or emulator fixture journey, or synthetic staging proof establishes only the boundary it exercised. None of them proves self-service export is available to staging users or that production exists.

## Manual feature checks

Use a manual staging check when automation does not yet cover the interaction, such as a new device-specific flow. Start with the feature's actual risk. For a posting change, that might mean creating one approved synthetic post and confirming a second attempt is rejected. For a permission change, check both the allowed account and a denied account.

Before checking:

1. Confirm the coordinated staging release completed for the intended reviewed commit.
2. Use an approved synthetic staging account. Do not use a personal account or production data.
3. Decide what observable result proves the feature, including a negative case when permissions or ownership matter.
4. Avoid destructive checks unless a reviewed runbook explicitly owns their cleanup.

After checking, record the workflow run, commit attribution available from the workflow, browser or device used, steps, sanitized outcome, and anything not covered. Never paste passwords, cookies, tokens, authorization headers, private content, or database URLs into an issue or artifact.

Screenshots are optional evidence, not the default. Check them for account details, private content, URLs, and browser storage before sharing. The authentication synthetic deliberately retains no screenshots or traces because its session data is more sensitive.

## Diagnose a staging failure

First identify the failing boundary:

- A local workflow-contract failure means the automation definition or fixture no longer follows its safety rules. It is not evidence about staging availability.
- A schema-target or migration failure happens before application proof. Do not continue with an ad hoc deploy around it.
- A Hyperdrive proof failure concerns the deployed Worker-to-database path or its transaction and permission checks. Use its sanitized artifact and workflow logs.
- A browser synthetic failure concerns the deployed web authentication journey. Its allowlisted category narrows the phase without exposing browser values.

Reproduce locally when the failure can be represented without credentials. If it only occurs in deployed infrastructure, change and rerun the reviewed workflow. Do not print a secret or enable verbose request logging to diagnose it.

## Production and load-test boundaries

The repository currently has a coordinated staging application release workflow. It does not have a production application release workflow or a production synthetic browser journey. The manual database migration workflow can target production, with separate confirmation and prior-staging safeguards, but that is not production application verification.

Dayli also has no general load or stress-test runner. A load test against shared staging or production needs an approved traffic plan, data plan, provider limits, monitoring, and cleanup. Until that work exists, do not repurpose integration, Hyperdrive, or synthetic commands to generate load.

A successful staging check proves only the named journey and resources at that time. It does not establish an uptime guarantee, complete regression coverage, or production readiness by itself.
