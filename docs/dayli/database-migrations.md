# Database migrations

Dayli uses Neon PostgreSQL 18. The Neon project has a `production` parent branch and a `staging` child branch. PostgreSQL `public` remains the application schema. `packages/db` owns Drizzle schema files, migration SQL, migration review records, and migration commands.

## Roles and connections

Run `packages/db/admin/bootstrap-roles.sql` separately on both Neon branches as an administrator, then set role passwords outside Git.

- `migrator` owns schema objects and Drizzle migration metadata.
- `app` receives automatic `SELECT`, `INSERT`, `UPDATE`, and `DELETE` grants on new `public` application tables, but cannot change schema or read/write Drizzle metadata.

Migrations use an unpooled direct Neon `DATABASE_URL` with `sslmode=require` or stricter. Worker runtime access will later use the restricted `app` role through Hyperdrive; Hyperdrive binding setup is separate from this foundation.

## Better Auth target schema

`0001_better_auth_postgres` is the additive Better Auth 1.7.5 target schema. It creates `user`, `account`, `session`, and `verification` with text primary and foreign keys. The `user` table retains legacy profile metadata and the `account` table retains its legacy-compatible provider and credential columns. This migration creates an empty Neon target only. It does not connect to Supabase and does not import `account`, `session`, or `verification` records. A later separately approved import may preserve user IDs and profile values, while users establish new target sessions.

## Legacy Supabase boundary

The legacy Supabase database is not a Neon migration target and must never use the `migrator` connection. `pnpm db:migration:inventory` uses a separately provisioned `LEGACY_SUPABASE_READONLY_DATABASE_URL`, starts a read-only transaction, and returns aggregate counts only. It does not copy data.

`pnpm db:migration:users-and-accounts` is a separately controlled direct users-and-login-accounts transfer. It requires a Supabase `LEGACY_SUPABASE_USERS_ACCOUNTS_READONLY_DATABASE_URL` credential with `CONNECT` and `SELECT` on `public.user` and `public.account` only, plus a direct TLS `NEON_USERS_ACCOUNTS_IMPORT_DATABASE_URL` for the protected `users_accounts_importer` role. The role has only `SELECT` and `INSERT` on those two Neon tables, not application-wide DML or migration privileges. The command is dry-run by default. Applying also requires `--apply` and `APPLY_USERS_ACCOUNTS_IMPORT="IMPORT users and accounts"`. It copies compatible Better Auth credential hashes and the provider identity mapping, but never reads or copies OAuth tokens, token expiry fields, scope, sessions, verification records, posts, or other dependent content. See [Supabase to Neon migration boundary](supabase-neon-migration-boundary.md) for compatibility limits, fixture rules, rehearsal gates, and required OAuth deployment work.

## Commands

```bash
pnpm db:generate
pnpm db:check
pnpm db:migration:users-and-accounts
# Apply only after approval, with protected environment variables set:
pnpm db:migration:users-and-accounts -- --apply
MIGRATION_TARGET=local DATABASE_URL=postgresql://migrator:migrator@localhost:5433/dayli_test pnpm db:migrate
MIGRATION_TARGET=local DATABASE_URL=postgresql://migrator:migrator@localhost:5433/dayli_test pnpm db:verify
pnpm db:test:up && pnpm db:test && pnpm db:test:down
```

`pnpm db:verify` is read-only and fails when local migrations are pending, applied hashes changed, or the database contains unknown migration records.

## Safety policy

- Generate normal migrations from `packages/db/src/schema` with Drizzle.
- Keep existing SQL and snapshots immutable and the shared journal append-only.
- Prefer additive, independently deployable changes while older mobile clients remain installed.
- Use Squawk for PostgreSQL safety checks.
- Any Squawk suppression must target the exact rule and have a matching review YAML under `packages/db/migrations/reviews/` documenting reason, affected data and clients, rollout sequence, backup checkpoint, forward-fix plan, and reviewer.
- Pending migrations run with a PostgreSQL advisory lock, a 30-second lock-acquire limit, a 5-second object-lock timeout, and a 5-minute statement timeout.
- Migrations are forward-only. Do not write automatic down migrations.

## Release order

1. Merge schema and migration changes to `main` through a PR that passes the **Database migrations** workflow and CODEOWNER review.
2. Run the protected manual migration workflow for `staging` from `main`.
3. Verify the sanitized evidence artifact and application compatibility.
4. For production, confirm a recent Neon restore point/backup, receive protected-environment approval, and run the same `main` commit after staging has succeeded.
5. Deploy dependent Worker code after the additive database change is present.

## Rollback and restoration

Prefer application rollback when a code release is faulty. For database mistakes, write a forward-fix migration. If data or schema damage requires restoration, use Neon branch restore/restore point procedures, record the chosen checkpoint, expected data loss window, and verification performed, then redeploy from `main`. A live restoration exercise is not required for this foundation ticket.

## Break glass

Normal staging and production migrations run only through GitHub Actions. A reviewed break-glass migration may be run locally only when GitHub Actions is unavailable and delaying would worsen an incident. Use the direct `migrator` URL from the protected secret store, set `MIGRATION_TARGET`, run `pnpm db:check`, `pnpm db:migrate`, and `pnpm db:verify`, save sanitized command output, and open a retrospective PR/issue with the evidence.

## Repository settings evidence

Before closing the issue, repository administrators still need to verify protected `staging` and `production` environments, `@AntGa` as required environment reviewer, main-only deployment restrictions, required **Database migrations** status check, CODEOWNER review, stale approval dismissal, and administrator bypass. Capture screenshots or settings exports without secrets or private Neon hostnames.
