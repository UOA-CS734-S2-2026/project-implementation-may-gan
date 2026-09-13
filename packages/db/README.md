# @dayli/db

`packages/db` owns the Dayli Drizzle schema, PostgreSQL migration history, and direct migration tooling. See the [environment guide](../../docs/dayli/environments.md) for local PostgreSQL lifecycle and credential handling.
Runtime Workers will later use Hyperdrive with the restricted `app` role; migration commands connect directly to Neon with the `migrator` role and an unpooled URL.

## Commands

Run from the repository root:

- `pnpm db:generate` — generate a normal Drizzle migration from `packages/db/src/schema`.
- `pnpm db:check` — validate Drizzle metadata, generated-schema drift, Squawk safety, and reviewed suppressions.
- `pnpm db:migrate` — apply pending migrations for `MIGRATION_TARGET`.
- `pnpm db:verify` — strict read-only migration-state verification.
- `pnpm db:smoke` — connection smoke check.
- `pnpm db:test:up`, `pnpm db:test`, `pnpm db:test:down` — local PostgreSQL 18 integration workflow.

## Required environment

- `MIGRATION_TARGET`: `local`, `staging`, or `production`.
- `DATABASE_URL`: direct migration connection for `migrator`.
- `TEST_DATABASE_URL`: local `migrator` test connection.
- `TEST_APP_DATABASE_URL`: local restricted `app` test connection.

Local tests must use `localhost:5433/dayli_test`. Staging and production must use a direct `*.neon.tech` host, must not use `-pooler`, and must include `sslmode=require` or stricter. Production also requires `CONFIRM_PRODUCTION_MIGRATION="MIGRATE production"` and `CONFIRM_NEON_BACKUP_CHECKED=true`.

## Workers Hyperdrive check

The API's credentialed staging check uses `createHyperdriveDatabase(env.HYPERDRIVE)`. It creates the Drizzle client for one Worker service-binding call, runs `select 1 as ok`, and closes it in `finally`.

See [`apps/api/README.md`](../../apps/api/README.md) for the protected staging setup and command. The check is not part of ordinary CI. It uses an isolated staging database, a real deployed Worker binding, and no public HTTP route.

## Policy

Migration history is forward-only and additive by default. Existing migration SQL and Drizzle snapshots are immutable; `_journal.json` is append-only. Squawk suppressions are allowed only for the exact rule and require a matching YAML review document in `packages/db/migrations/reviews/` with the required rollout, backup, forward-fix, and reviewer fields.

`packages/db/admin/bootstrap-roles.sql` is run by an administrator on each Neon branch. It provisions `migrator` for schema ownership and `app` for DML-only access to new `public` tables. Do not commit passwords, URLs, branch IDs, screenshots containing private hostnames, or workflow logs containing secrets.
