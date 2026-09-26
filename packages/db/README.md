# @dayli/db

`packages/db` owns the Dayli Drizzle schema, immutable PostgreSQL migration history, direct migration tooling, and local restricted-role integration coverage. Migrations `0000` through `0007`, their snapshots, and `_journal.json` are immutable. See [Database migrations](../../docs/dayli/database-migrations.md) for the staging-first runbook and [Environments](../../docs/dayli/environments.md) for local setup and live-environment boundaries.

Staging is the first and currently empty Neon project. It is not a validated deployment. No production service is deployed; any old empty production Neon project must be inventoried before replacement. Its eventual database must be a separate Neon project, not a staging branch. `migrator` is the direct, unpooled migration role. `app` is Worker runtime access through Hyperdrive. `neondb_owner` is bootstrap-only and must never be a Worker or Hyperdrive credential.

## Commands

Run from the repository root:

- `pnpm db:generate`: generate a normal Drizzle migration from `packages/db/src/schema`.
- `pnpm db:check`: validate Drizzle metadata, schema drift, migration immutability, Squawk safety, and reviewed suppressions.
- `pnpm db:migrate`: apply pending migrations for `MIGRATION_TARGET`.
- `pnpm db:verify`: strict read-only migration-state verification.
- `pnpm db:smoke`: connection smoke check.
- `pnpm db:test:up`, `pnpm db:test`, `pnpm db:test:down`: local PostgreSQL 18 restricted-role integration workflow.

## Required environment and guards

- `MIGRATION_TARGET`: exactly `local`, `development`, `staging`, or `production`.
- `DATABASE_URL`: direct `migrator` migration connection.
- `TEST_DATABASE_URL`: local `migrator` test connection.
- `TEST_APP_DATABASE_URL`: local restricted `app` test connection.

Disposable local test migrations accept only `localhost:5433/dayli_test` and `localhost:5433/dayli_relationship_test`. Persistent local development accepts only `migrator` at `localhost:5434/dayli_dev` through `pnpm db:dev:migrate`. Staging and production must use a direct `*.neon.tech` host, not `-pooler`, with `sslmode=require` or stricter. Production migration application also requires `CONFIRM_PRODUCTION_MIGRATION="MIGRATE production"` and `CONFIRM_NEON_BACKUP_CHECKED=true`. `db:verify` is read-only and rejects pending migrations, changed applied hashes, and unknown migration records.

## Neon role bootstrap

After the password block is cleared, run `admin/bootstrap-roles.sql` as `neondb_owner`; it creates only the restricted `migrator` and `app` roles with no passwords. Then run `admin/bootstrap-migrator.sql` through a direct `migrator` connection so that role can set its own public-schema defaults and own the `drizzle` schema. Run read-only `admin/verify-role-bootstrap.sql` as `neondb_owner`; every value must be true before migrations or Hyperdrive setup.

Neon rejected `psql`'s `\password` because it submits a password hash, while Neon requires plaintext. Do not use it or enter role passwords in SQL Editor, shell history, process arguments, Git, chat, screenshots, or workflow logs. No safe Neon-compatible first-password procedure is validated or documented. The user must review and test one on the empty staging project before live bootstrap proceeds. Until then, stop rather than use a plaintext SQL workaround.

## Workers Hyperdrive check

After staging bootstrap succeeds, the retained manual credentialed Hyperdrive check uses `createHyperdriveDatabase(env.HYPERDRIVE)`. It creates a fresh Drizzle client per Worker invocation, retains `select 1 as ok`, and proves transactions and constraints through the private entrypoint. Each invocation closes its postgres.js client in `finally`, returning the Hyperdrive connection promptly instead of retaining it in a Worker isolate. Run `admin/bootstrap-staging-probe.sql` once as an administrator in staging; it is not a migration.

See [`apps/api/README.md`](../../apps/api/README.md) for the protected staging setup and manual command. This check is not ordinary CI or an automatic PR gate. Once provisioned, it uses isolated staging, a real deployed Worker binding, and no public HTTP route.

## Safe reset inventory and release order

Before resetting the empty staging project, record a sanitized inventory of its project and branch identity, intended target, role names, schema and Drizzle migration-record counts, Hyperdrive attachment status, and restore points. If any unexpected object, migration record, role, attachment, or data exists, stop and use a fresh project or a reviewed restoration plan. Never use this reset process for production.

Keep the protected staging and production workflows as manual `workflow_dispatch` operations. Stage first from `main`, review the sanitized evidence and `app`-through-Hyperdrive compatibility, then provision a separate production project and run the same commit with backup and protected-environment approval.

## Policy

Migration history is forward-only and additive by default. Squawk suppressions are allowed only for the exact rule and require a matching YAML review document in `packages/db/migrations/reviews/` with the required rollout, backup, forward-fix, and reviewer fields.

Friendship rows are a paired directional projection. Migration `0006_absurd_swordsman` enforces that both directions exist with the same state at transaction commit; callers must change both rows in one transaction. Relationship foreign keys intentionally use `NO ACTION`: account deletion must explicitly resolve relationship history in a later reviewed workflow rather than silently cascading it away.

## Deletion cleanup

Application deletion first makes the post or account inaccessible. A tracked cleanup job then connects as `migrator` and removes dependent rows in child-first order. For a post, delete `tomorrow_notes`, `post_revisions`, `legacy_cloudinary_media`, and `post_media` before `posts` (`post_idempotency_keys` rows cascade with their post); for an account, remove relationship rows and post children before the `user` row. Immutable-history triggers permit deletes only for `migrator`; the job must record each batch and retry failures. Ordinary app connections cannot delete immutable history or prompt rows.
