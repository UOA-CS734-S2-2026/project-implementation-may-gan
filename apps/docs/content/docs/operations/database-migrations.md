---
title: Database migrations
description: Review, apply, verify, and recover Dayli schema changes without rewriting migration history or bypassing database roles.
---

# Database migrations

A migration is an ordered SQL change that moves an existing database to a new known shape. It matters because application code can change in seconds while stored data and installed clients live much longer.

Dayli describes the desired schema with Drizzle TypeScript, then keeps generated SQL and metadata as an append-only history. PostgreSQL is the runtime authority. Editing a TypeScript table does not change staging, and changing an already applied SQL file does not safely change history. It only makes the checked-out history disagree with the database ledger.

This page covers staging operations. The development guide explains how to [design and generate a migration](/docs/development/database). The release guide explains how schema work fits into [a coordinated deployment](/docs/operations/environments-and-deployment).

## Files, snapshots, and the ledger

Dayli keeps schema definitions in `packages/db/src/schema/`, SQL in `packages/db/migrations/*.sql`, Drizzle snapshots and `_journal.json` in `packages/db/migrations/meta/`, and reviewed Squawk suppression records in `packages/db/migrations/reviews/`.

Each database records applied migrations in `drizzle.__drizzle_migrations`. Dayli compares the ordered names and SHA-256 hashes in that ledger with the checked-out files. The consequences are deliberate:

- applied SQL, snapshots, and journal entries are immutable;
- a correction gets a new forward migration;
- the applied ledger must be an exact prefix before new SQL runs;
- release verification requires the database and checkout to have the same complete ordered history.

A generated migration is a draft. Review locks, rewrites, existing rows, foreign keys, constraints, defaults, and application compatibility. Squawk warnings need a concrete fix or a rule-specific review record. A suppression is not a small coupon for one free table lock.

## Database roles and connections

Schema authority and application traffic use different credentials.

| Role or path | Purpose | Boundary |
| --- | --- | --- |
| Direct `migrator` connection | Plan, apply, and verify migration history | Protected workflow only, direct unpooled Neon host |
| Hyperdrive `app` connection | Normal API queries | Restricted runtime binding, no schema ownership or migration metadata access |
| `lifecycle_worker` connection | Narrow reviewed lifecycle and export operations | Separate restricted Hyperdrive, not a substitute for either role |
| Provider owner | Initial role and grant provisioning, exceptional provider recovery | Never an application, Hyperdrive, or routine migration credential |

`verify-staging-schema-target.mjs` checks that the direct `migrator` URL and the app Hyperdrive identify the same direct Neon host, port, and database, while requiring the expected distinct roles. This prevents a migration from succeeding against one database before the Worker deploys against another.

Do not solve a permission error by giving the app role ownership or by putting the owner URL into `DATABASE_URL`. Fix the reviewed grant or operation at the correct boundary.

## Prepare a schema change

A safe migration is usually additive and compatible with both the old and new application for the release window. Removing a column, changing populated data, or adding a strict constraint may need several releases.

Before review:

1. Update the owning Drizzle schema.
2. Run `pnpm db:generate` once and inspect every generated SQL and metadata change.
3. Confirm `_journal.json` only appended the expected entry. Never rename or edit an older entry.
4. Add focused Squawk review records where a warning has a justified forward plan.
5. Run `pnpm db:check`. It checks metadata, generated-schema drift, history immutability, journal ordering, Squawk findings, and repository inventory rules. It does not apply SQL.
6. Run `bash scripts/verify-postgres.sh`. It uses disposable PostgreSQL 18, applies the full history, verifies it, repeats application, and runs integration tests.
7. Apply and verify it in the persistent local development database with `pnpm db:dev:migrate` and `pnpm db:dev:verify`.
8. Run affected feature tests and `pnpm verify:local`. Record the exact commit and sanitized result.

Do not point local scripts at staging. The repository's hosted workflow owns staging credentials, concurrency, target checks, and evidence.

## Normal staging migration path

A normal staging schema change runs inside **Deploy coordinated staging release**. This is the preferred path because code and schema remain one release.

For the captured commit, the API stage:

1. verifies that direct migration and Hyperdrive targets match;
2. runs `db:check` against the captured migration files;
3. runs a read-only `db:plan`;
4. runs migration-specific preflights where present;
5. calls `db:migrate` only when the plan reports a pending reviewed suffix;
6. runs read-only `db:verify` for exact ordered hashes;
7. deploys and proves the API before web deploys.

The migrator takes PostgreSQL advisory lock `7340008`, checks the applied prefix while holding it, and then invokes Drizzle. It uses one connection, a five-second lock timeout, and a five-minute statement timeout. These are safeguards, not a promise that every migration is safe within those limits.

The API and manual staging paths share the non-cancelling `staging-database-state-staging` concurrency group. They queue instead of racing one another.

## Separate manual migration workflow

`.github/workflows/run-database-migrations.yml` is a protected manual path. Use it only for an approved migration operation that must run separately from the application release, such as reconciliation after a stopped release. It is not a way to skip the coordinated release.

Dispatch **Run database migrations** from `main` with these exact inputs:

| Input | Staging use |
| --- | --- |
| `target` | Select `staging` |
| `production_backup_checked` | Leave blank for staging |
| `production_messaging_0024_size_cap_bytes` | Leave blank for staging |

The workflow checks, plans, runs the staging size preflight, applies only when pending, verifies, then uploads `database-migration-evidence-staging-<commit>` for 90 days. The evidence contains commit, target, run metadata, ordered migration names and hashes, and step outcomes. It does not contain a database URL or row data.

The workflow also exposes a `production` target with exact confirmation and prior-staging safeguards. The repository has no production application release environment today. Do not select that option until a production environment and complete procedure have been provisioned and approved.

## What success means

Separate these outcomes:

- `db:check` says the checked-in history and review metadata satisfy repository rules.
- `db:plan` says whether a valid pending suffix exists.
- `db:migrate` says the runner completed its attempt under the migration lock.
- `db:verify` says the database ledger exactly matches the checked-out ordered names and hashes.
- The Hyperdrive proof says the deployed API can use the restricted app path and its tested operations.

None of them alone proves every table, constraint, data invariant, query plan, backup, or product journey. Run the focused application smoke after the coordinated release.

## Handle a failure without making it larger

First identify whether mutation began. GitHub's step list and sanitized migration evidence are safer than opening a live credential in a terminal.

### Failure before apply

A target mismatch, metadata error, unsafe plan, migration-specific preflight failure, or missing approval happens before normal application. Stop the release. Fix the candidate or environment through review, then start a new approved run. Do not bypass the target check or disable a preflight.

### Failure during or after apply

A failed process does not tell you that nothing changed. A migration can contain several statements or transaction boundaries, and an application step may fail after PostgreSQL committed useful work.

1. Stop the application release. Do not deploy web or manually deploy API around the gate.
2. Preserve the run ID, commit, failed step, sanitized error class, and migration evidence.
3. Use an approved workflow to inspect the ledger and run read-only verification. Never paste the live URL into a shell.
4. Compare the actual applied prefix with the candidate's migration names and hashes.
5. Review the SQL to determine whether PostgreSQL committed all, part, or none of the intended change. Do not infer this from the job colour.
6. Prepare a reviewed forward migration or reconciliation change that makes the resulting state explicit.
7. Run local disposable verification again, then use the manual staging workflow if the reviewed recovery requires a separate database operation.
8. Resume the coordinated release only after exact verification succeeds.

Do not blindly rerun a failed migration. Do not edit the ledger, rewrite applied SQL, use a down migration, reset staging, or grant the owner role to force progress.

## Forward recovery and backups

Dayli migrations are forward-only. When the latest database shape is incompatible with older application code, the normal recovery is a compatible forward fix followed by a coordinated release. Historical application rollback works only when its checked-in hashes exactly match staging.

A provider backup or restore is a separate, destructive operational decision. It can discard newer data and disconnect schema history from external resources. The current repository does not establish a tested staging restore procedure, recovery point objective, or recovery time objective. Do not invent one from the presence of a provider dashboard.

If restore is considered, require an explicit reviewed plan that names the restore point, data-loss window, affected Workers, release commit, verification steps, decision owner, and communication plan. Quiesce writers through an approved control, restore through the provider's approved process, then verify the ledger and application before reopening traffic. Do not use restore merely to make an old commit deployable.

## Safe evidence and privacy

Migration evidence should contain revision, migration names and hashes, target label, workflow run, outcomes, and sanitized timing. It should not contain:

- connection strings or credentials;
- table rows, profile fields, message text, email addresses, or media keys;
- raw provider errors that include a URL;
- copied shell environments.

The runner sanitizes known database errors, but operators still need to review output before sharing it. Use the protected workflow for live checks and keep local verification clearly labelled as local.

## Current limits

This runbook describes the checked-out workflows and the fetched `origin/main` behavior observed on 4 October 2026. It does not claim a current staging migration is pending, a backup exists, a restore has been tested, or production is deployed.
