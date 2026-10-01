# Database migrations

Dayli uses Neon PostgreSQL 18. Staging is the first deployment target. Its owner reports restricted SQL roles with passwords, owner grants, migrator defaults, and a successful read-only bootstrap check. The protected workflow applied and verified migrations `0000` through `0007`. The deployed staging API Worker uses a cache-disabled Hyperdrive connection as `app`. The private Hyperdrive transaction proof passed at `1fb6388`. A manual staging browser email/password flow worked; Google, Resend, and native sessions remain untested. No production service is deployed. If an old empty production Neon project remains, inventory it and replace it only after staging validation. The replacement must be a **separate Neon project**, not a staging branch. Do not use a staging branch as production.

`packages/db` owns the Drizzle schema, migration SQL, review records, and migration commands. PostgreSQL `public` is the application schema. Published migrations, snapshots, and journal entries through `0018_media_reservation_cleanup` are immutable.

## Roles and connection boundaries

Three SQL-created restricted login roles are intended:

- `migrator` owns application schema objects and the Drizzle metadata schema. It is used only by direct, unpooled migration tooling.
- `app` receives application-table DML defaults and is used by Workers only through Hyperdrive.
- `lifecycle_worker` is reserved for later reviewed lifecycle procedures. It has no Worker binding, runtime credential, or direct lifecycle-table access in the foundation migration.

`neondb_owner` creates roles and grants but is never a Worker runtime credential, Hyperdrive credential, or application `DATABASE_URL`. Do not create runtime roles in Neon Console because that path grants `neon_superuser`.

Create the `migrator` and `app` restricted login roles with passwords in the empty target, then run `packages/db/admin/bootstrap-roles.sql` as `neondb_owner`. That script creates `lifecycle_worker` if needed; do not connect it until a separately reviewed binding and procedure exist. The script grants database and `public` schema access, and creates a missing role without a password if a previous setup stopped early. Do not connect a passwordless role. Run `packages/db/admin/bootstrap-migrator.sql` through a direct TLS `migrator` connection. PostgreSQL permits default-privilege changes only by the current role or a member role, so the owner must not attempt `ALTER DEFAULT PRIVILEGES FOR ROLE migrator`. The migrator script creates and owns `drizzle`, gives `app` DML defaults for `public`, and excludes `app` from Drizzle metadata. It is safe to rerun after interruption.

Run the read-only `packages/db/admin/verify-role-bootstrap.sql` as `neondb_owner` after bootstrap and after password rotation. Every reported value must be `true` before migration or Hyperdrive setup.

## Create restricted role credentials

In Neon SQL Editor, select the intended empty project, branch, and database. Run as `neondb_owner`. Use a password manager to generate two distinct passwords with at least 60 bits of entropy; long random alphanumeric values avoid SQL-quoting problems. Replace the placeholders below **only in the SQL Editor**. Do not paste the resulting statement into Git, chat, PRs, terminal commands, or screenshots.

```sql
CREATE ROLE migrator WITH LOGIN PASSWORD '<unique migrator password>';
CREATE ROLE app WITH LOGIN PASSWORD '<different app password>';
```

Neon requires the plaintext value for this SQL operation. SQL Editor or database query history may retain the statement. Restrict Console access and handle that history according to the team's retention policy. Keep the generated credentials in the approved password manager and protected secret stores. Never use the Console's Create role action for `app` or `migrator`, since Neon gives Console-created roles `neon_superuser` membership.

Before connecting as a new role, run this read-only check as the owner. Expect exactly three rows. `rolcanlogin` and `no_memberships` must be `true`; all other flags must be `false`. Stop if anything differs.

```sql
SELECT r.rolname, r.rolcanlogin, r.rolsuper, r.rolcreatedb,
       r.rolcreaterole, r.rolreplication, r.rolbypassrls,
       NOT EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.member = r.oid)
         AS no_memberships
FROM pg_roles r
WHERE r.rolname IN ('migrator', 'app', 'lifecycle_worker');
```

If either role already exists from an interrupted passwordless bootstrap, inspect its membership before doing anything else. Use `ALTER ROLE ... WITH PASSWORD` in the same SQL Editor instead of attempting a duplicate `CREATE ROLE`. Neon rejected `psql`'s `\password` for a SQL-created role because it sent a hash, and Console Reset password refused a passwordless SQL-created probe role. Do not retry either method.

## Guarded live migration order

For staging, and later for a separate production project, the order is fixed: inventory the empty target; create the restricted SQL roles with distinct passwords; run `bootstrap-roles.sql` as `neondb_owner`; run `bootstrap-migrator.sql` directly as `migrator`; require `verify-role-bootstrap.sql` to return only `true`; apply and verify reviewed migrations through the protected manual workflow; then attach Hyperdrive as `app` and deploy dependent Worker code. Do not reverse this sequence, use an owner connection at runtime, or use staging as a production branch.

## Safe staging reset inventory

A reset is permitted only while the staging project is known empty and before Hyperdrive, Worker deployment, or application data. Before any destructive staging action, record a sanitized inventory: Neon project and branch identity, intended target, restricted role names, schema and Drizzle migration-record counts, Hyperdrive attachment status, and available restore points. Do not record URLs, passwords, row contents, or customer data.

If any application object, migration record, role beyond the planned bootstrap, Hyperdrive attachment, or data is present unexpectedly, stop. Do not drop objects selectively or treat the project as empty. Create a fresh staging project or obtain a reviewed restoration plan. Never reset production under this procedure. Production starts later as a separate empty project and follows the same staging-proven bootstrap and migration sequence.

## Better Auth schema compatibility

`0001_better_auth_postgres` creates the Better Auth 1.7.5 `user`, `account`, `session`, and `verification` tables with text primary and foreign keys. The user profile fields and account provider and credential columns remain compatible with the application authentication adapter. The migration creates an empty target schema only and performs no user, account, session, or verification import.

## Google account mapping preflight

Migration `0008_overrated_ink` adds the database-enforced unique mapping for `(provider_id, account_id)` and the short-lived browser OAuth link confirmation table. Before the migration is approved for staging, an authorized operator must run this read-only preflight through the approved direct `migrator` connection and retain only sanitized counts in the change record:

```sql
SELECT count(*) AS duplicate_provider_subject_keys
FROM (
  SELECT 1
  FROM public.account
  GROUP BY provider_id, account_id
  HAVING count(*) > 1
) AS duplicates;
```

The expected result is a count of zero. Any nonzero count is a hard stop. Do not delete, merge, reassign, or otherwise deduplicate account mappings automatically or during the migration. Obtain a separately reviewed data-remediation plan, backup checkpoint, and staging approval before retrying. The migration repeats a fail-closed duplicate guard before creating the constraint.

`0008` requires a separately approved staging migration workflow after this preflight. Apply it before deploying the Worker code that issues or consumes browser Google-link confirmations. Do not use local validation as approval to run a hosted migration or deploy.

## Commands and exact guards

```bash
pnpm db:check
MIGRATION_TARGET=local DATABASE_URL=postgresql://migrator:migrator@localhost:5433/dayli_test pnpm db:migrate
MIGRATION_TARGET=local DATABASE_URL=postgresql://migrator:migrator@localhost:5433/dayli_test pnpm db:verify
MIGRATION_TARGET=local DATABASE_URL=postgresql://migrator:migrator@localhost:5433/dayli_relationship_test pnpm db:migrate
pnpm db:test:up && pnpm db:test && pnpm db:test:down
```

Migration commands enforce all of these guards:

- `MIGRATION_TARGET` is exactly `local`, `development`, `staging`, or `production`.
- `DATABASE_URL` must name the `migrator` role.
- Disposable local test migrations use only the named localhost fixture databases, including `dayli_test`, `dayli_relationship_test`, and the isolated `dayli_lifecycle_test` lifecycle and export fixture. Persistent local development uses only `migrator` at `localhost:5434/dayli_dev` through `pnpm db:dev:migrate` and `pnpm db:dev:verify`.
- Staging and production URLs require a direct `*.neon.tech` host, reject `-pooler`, and require `sslmode=require`, `verify-ca`, or `verify-full`.
- Production migration application additionally requires `CONFIRM_PRODUCTION_MIGRATION="MIGRATE production"` and `CONFIRM_NEON_BACKUP_CHECKED=true`.
- `pnpm db:verify` opens a read-only transaction and compares the ordered `drizzle.__drizzle_migrations` hashes with the migration SQL in the checked-out release. It fails if migrations are pending, hashes differ, or the database has unknown migration records.

Before that comparison, the coordinated staging API workflow reads the exact Hyperdrive selected by `CLOUDFLARE_STAGING_HYPERDRIVE_ID` through Cloudflare's read-only API. It compares the returned direct Neon host, database, and port with the parsed direct `DATABASE_URL`. It accepts `migrator` for the direct connection and requires Hyperdrive to use the restricted `app` role. It rejects pooler hosts, unavailable origin fields, and every mismatch without printing a connection string or target values.

The workflow checks out the captured release at the repository root and separately checks out the immutable workflow tooling revision. It runs the tooling revision's verifier against the root release's migration directory, so a compatible historical rollback does not need to contain the verifier while its own migration hashes remain the comparison input. The comparison happens before it generates configuration, synchronizes Worker secrets, deploys either Worker, or runs the Hyperdrive proof. It uses the existing protected staging `DATABASE_URL` only as a direct `migrator` connection. It does not use Hyperdrive or expose that connection to a Worker. This is a migration-record check, not a CI-artifact or commit-SHA check, so a documentation-only commit does not change the result. It does not inspect every physical schema object and cannot prove that no out-of-band DDL drift occurred. The gate never applies migrations. Pending records require reviewed staging migrations and a retry. Changed hashes require a migration-ledger investigation, not an edit to applied migrations. Unknown or newer records require compatible code or a reviewed forward fix, never a destructive downgrade.

`pnpm db:migrate` takes a PostgreSQL advisory lock, waits up to 30 seconds for it, uses a 5-second object-lock timeout, and uses a 5-minute statement timeout. It is forward-only. Do not write automatic down migrations.

## Safety policy

- Generate normal migrations from `packages/db/src/schema` with Drizzle.
- Keep existing SQL and snapshots immutable and the shared journal append-only.
- Prefer additive, independently deployable changes while older mobile clients remain installed.
- Use Squawk for PostgreSQL safety checks.
- A Squawk suppression must target one rule and have a matching review YAML under `packages/db/migrations/reviews/` documenting reason, affected data and clients, rollout sequence, backup checkpoint, forward-fix plan, and reviewer.

## Staging-first release order

Local restricted-role integration coverage is the current proof. GitHub-hosted PR and push checks are paused. The **Database migrations** workflow remains `workflow_dispatch` only and is not an automatic migration gate. The protected **Run database migrations** workflow also remains manual dispatch and is the only normal staging or production migration path.

After `migrator` and `app` have passwords, `lifecycle_worker` has been bootstrapped without a runtime binding, their grants and migrator defaults are in place, and `verify-role-bootstrap.sql` reports only `true`:

1. Merge the reviewed schema change to `main` with recorded local verification and CODEOWNER review.
2. Dispatch the protected staging workflow from `main` with the restricted `migrator` secret.
3. Review the sanitized evidence artifact and verify application compatibility through Hyperdrive as `app`, never as owner.
4. Provision a separate production Neon project only after staging succeeds. Confirm a recent production restore point, obtain protected-environment approval, and dispatch the same `main` commit with the production confirmations.
5. Dispatch the coordinated staging release. Its read-only schema gate must pass before it can synchronize secrets, deploy the API, run the Hyperdrive proof, or deploy web.

## Rollback, break glass, and repository settings

Prefer application rollback for a faulty release. For database defects, write a forward-fix migration. If restoration is necessary, use Neon restore-point procedures, record the chosen checkpoint, expected data-loss window, and verification, then redeploy from `main`.

The release gate requires an exact ordered migration history for the selected commit. It rejects a rollback commit when staging has migrations that are newer than that checkout, even if the older application code might appear schema-compatible. It also rejects a newer application release when reviewed migrations are pending. Do not bypass the gate or restore a database just to make an old Worker deploy. Choose a release whose schema history exactly matches staging, or use a reviewed forward fix and migration plan.

The staging API job and staging manual-migration runs share a GitHub Actions concurrency group. It serializes those normal workflows from the target check through the API proof, but not through the dependent web job. GitHub Actions keeps at most one pending run in this group and replaces an older pending run when a newer request arrives. Do not rely on FIFO ordering. It cannot lock out a direct or break-glass database change, and it is not a continuing physical-schema guarantee after the check finishes.

Normal staging and production migrations run only through the manual GitHub Actions workflow. Break glass is allowed only when GitHub Actions is unavailable and delay would worsen an incident. Use the protected direct `migrator` URL, set `MIGRATION_TARGET`, run `pnpm db:check`, `pnpm db:migrate`, and `pnpm db:verify`, save sanitized output, and open a retrospective PR or issue.

Before release, administrators must configure protected `staging` and `production` environments with designated reviewers and main-only deployment restrictions. The `production` environment does not yet exist. Hosted CI is paused, so do not mark the **Database migrations** status check required until automatic checks are restored. Review CODEOWNER, stale-approval, and administrator-bypass settings. Capture screenshots or exports without secrets or private Neon hostnames.
