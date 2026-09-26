# @dayli/db

`packages/db` owns the Dayli Drizzle schema, PostgreSQL migration history, and direct migration tooling. See the [environment guide](../../docs/dayli/environments.md) for local PostgreSQL lifecycle and credential handling.
After staging is provisioned, runtime Workers will use Hyperdrive with the restricted `app` role; migration commands connect directly to Neon with the `migrator` role and an unpooled URL. The separate Neon staging project is currently empty, with no roles, migrations, or Hyperdrive attached. It is not a validated staging deployment, and production is unprovisioned.

## Commands

Run from the repository root:

- `pnpm db:generate`: generate a normal Drizzle migration from `packages/db/src/schema`.
- `pnpm db:check`: validate Drizzle metadata, generated-schema drift, Squawk safety, and reviewed suppressions.
- `pnpm db:migrate`: apply pending migrations for `MIGRATION_TARGET`.
- `pnpm db:verify`: strict read-only migration-state verification.
- `pnpm db:smoke`: connection smoke check.
- `pnpm db:migration:inventory`: aggregate-only, read-only inventory of the legacy Supabase schema for the approved migration boundary.
- `pnpm db:test:up`, `pnpm db:test`, `pnpm db:test:down`: local PostgreSQL 18 integration workflow.

## Required environment

- `MIGRATION_TARGET`: `local`, `staging`, or `production`.
- `DATABASE_URL`: direct migration connection for `migrator`.
- `TEST_DATABASE_URL`: local `migrator` test connection.
- `TEST_APP_DATABASE_URL`: local restricted `app` test connection.
- `LEGACY_SUPABASE_READONLY_DATABASE_URL`: separately provisioned TLS Supabase `SELECT`-only connection, used only by `db:migration:inventory`.

Local tests must use `localhost:5433/dayli_test`. Staging and production must use a direct `*.neon.tech` host, must not use `-pooler`, and must include `sslmode=require` or stricter. Production also requires `CONFIRM_PRODUCTION_MIGRATION="MIGRATE production"` and `CONFIRM_NEON_BACKUP_CHECKED=true`.

## Workers Hyperdrive check

After staging is provisioned, the manual credentialed Hyperdrive check will use `createHyperdriveDatabase(env.HYPERDRIVE)`. It creates a fresh Drizzle client per Worker invocation, retains `select 1 as ok`, and proves transactions and constraints through the private entrypoint. Each invocation closes its postgres.js client in `finally` after the operation resolves, returning the Hyperdrive connection promptly rather than retaining it in a Worker isolate. Direct PostgreSQL tooling also retains explicit close behavior. Run `admin/bootstrap-staging-probe.sql` once as an administrator in staging; it is not a migration.

See [`apps/api/README.md`](../../apps/api/README.md) for the future protected staging setup and manual command. The check is not part of ordinary CI or an automatic PR gate. Once provisioned, it uses an isolated staging database, a real deployed Worker binding, and no public HTTP route.

## Policy

Migration history is forward-only and additive by default. Existing migration SQL and Drizzle snapshots are immutable; `_journal.json` is append-only. Squawk suppressions are allowed only for the exact rule and require a matching YAML review document in `packages/db/migrations/reviews/` with the required rollout, backup, forward-fix, and reviewer fields.

Friendship rows are a paired directional projection. Migration `0006_absurd_swordsman` enforces that both directions exist with the same state at transaction commit; callers must change both rows in one transaction. Relationship foreign keys intentionally use `NO ACTION`: account deletion must explicitly resolve relationship history in a later reviewed workflow rather than silently cascading it away.

After approval to provision a separate synthetic-data Neon staging project, run `packages/db/admin/bootstrap-roles.sql` as `neondb_owner`, then run `packages/db/admin/bootstrap-migrator.sql` in a direct `migrator` connection. The split is required because an owner is not automatically a member of `migrator`, so it cannot set that role's default privileges. Complete the read-only `admin/verify-role-bootstrap.sql` check before migrations and after credential rotation. Set a SQL-created role's first password only from trusted interactive `psql`, connected as the owner, with `\password <role>`. Neon Console or API reset cannot set a password for a role that has none. Do not create application roles through Neon Console because it grants `neon_superuser`. The importer password can wait until an approved import needs it. Do not commit passwords, URLs, branch IDs, screenshots containing private hostnames, or workflow logs containing secrets.

## Deletion cleanup

Application deletion first makes the post or account inaccessible. A tracked
cleanup job then connects as `migrator` and removes dependent rows in child-first
order. For a post, delete `tomorrow_notes`, `post_revisions`,
`legacy_cloudinary_media`, and `post_media` before `posts`
(`post_idempotency_keys` rows cascade with their post); for an account,
remove relationship rows and post children before the `user` row. The immutable
history triggers permit deletes only for the `migrator` role, and the job must
record each batch and retry failed batches. Ordinary app connections cannot
delete immutable history or prompt rows.

The legacy Supabase inventory is not a Neon migration command. It starts a read-only transaction and emits aggregate counts only, but its database role must also be restricted to `CONNECT` and `SELECT` on the approved legacy tables. See [the Supabase to Neon migration boundary](../../docs/dayli/supabase-neon-migration-boundary.md) for the fixed scope, fixture rules, and evidence requirements.
