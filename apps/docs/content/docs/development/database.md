---
title: Database
description: Understand Dayli's PostgreSQL schema, Drizzle queries, and safe migration workflow.
---

# Database

A database keeps information after a request finishes or an app restarts. Without one, a post created today would disappear when the API process stopped. Dayli needs durable storage for accounts, posts, relationships, messages, and the rules that connect them.

Dayli uses PostgreSQL, a relational database. A relational database stores data in tables made of rows and columns, then connects those tables with keys. PostgreSQL can also enforce rules such as "this value is required", "this username is unique", or "this post must belong to an existing user". Those checks still run when two requests arrive together, which makes the database more than a large JSON file with excellent timing.

Drizzle is the TypeScript layer between Dayli's backend and PostgreSQL. We describe tables in TypeScript, use those definitions to build typed queries, and use Drizzle Kit to generate SQL migrations. PostgreSQL remains the system that stores the rows and enforces the migrated constraints.

Run the commands on this page from the repository root.

## Where Dayli keeps database code

The database package owns the shared schema and migration history:

| Path | What lives there |
| --- | --- |
| `packages/db/src/schema/` | Current Drizzle table, column, enum, index, and constraint definitions. |
| `packages/db/src/schema/index.ts` | The combined schema exported to query code. |
| `packages/db/migrations/*.sql` | Ordered SQL changes that PostgreSQL can apply. |
| `packages/db/migrations/meta/` | Drizzle's append-only journal and schema snapshots. |
| `packages/db/migrations/reviews/` | Review records required for approved Squawk safety suppressions. |
| `packages/db/src/migrate.ts` | Guarded, forward-only migration runner. |
| `packages/db/src/verify.ts` | Read-only comparison between the checked-out migrations and the database ledger. |

API repositories import `schema` and `DayliDatabase` from `@dayli/db`, then use Drizzle's query builders. The API keeps those repositories with the feature that owns the operation. Read [Backend architecture](./backend-architecture) for that layout and [Repository structure](./repository-structure) for the wider monorepo.

The web and mobile apps do not connect to PostgreSQL. They call the API, and the API decides which data the signed-in person may read or change.

## Schema definitions and real constraints

A Drizzle table definition does two related jobs. It gives TypeScript enough information to catch many incorrect query shapes while developing, and it gives Drizzle Kit the desired schema used to generate a migration.

For example, `packages/db/src/schema/daily-prompts.ts` derives these types from the `dailyPrompts` table:

```ts
export type DailyPrompt = typeof dailyPrompts.$inferSelect;
export type DailyPromptInsert = typeof dailyPrompts.$inferInsert;
```

Those are compile-time types. They disappear when JavaScript runs. A TypeScript type cannot stop another program, an old deployment, or a concurrent transaction from writing an invalid row.

The PostgreSQL constraints are the runtime backstop. The same daily prompt table declares unique constraints and checks for valid month and day text, positive versions, and prompt length. Those rules only exist in a database after its migration has been applied. Editing a schema file changes the desired TypeScript model, not a running database.

This distinction is useful when debugging. If TypeScript rejects a query, inspect the Drizzle definition and query types. If PostgreSQL rejects a write with a unique, foreign-key, check, or not-null error, inspect the applied migration and the stored data involved. If the TypeScript schema changed but a local query says a column does not exist, the likely missing step is migration application, not another type assertion.

## Why migrations exist

A migration is a versioned SQL step that moves an existing database from one known shape to the next. Dayli keeps migrations because databases outlive individual deployments. Editing a live table by hand would leave no dependable record for another developer, a fresh test database, or staging.

Each database records applied migration hashes in `drizzle.__drizzle_migrations`. Dayli's verifier compares that ordered ledger with the SQL in the checked-out release. This is why an applied migration is immutable. If an old migration needs correction, add a new forward migration. Do not rewrite its SQL, snapshot, or journal entry, and do not use a down migration to make the history look tidy.

Prefer additive changes that old and new application versions can both tolerate. A new nullable column or a new table can often ship before code starts using it. Renaming or removing a column, adding a required value to populated rows, or changing a constraint may need a staged rollout and a data plan. Mobile clients can remain installed after the backend changes, so compatibility is a real product concern rather than paperwork.

## A real Dayli migration

Profile avatars show how the TypeScript schema, generated SQL, and application query fit together.

`packages/db/src/schema/index.ts` defines one avatar row per user:

```ts
export const profileAvatars = pgTable("profile_avatars", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  reservationId: text("reservation_id").notNull().unique().references(() => mediaReservation.id, { onDelete: "cascade" }),
  setAt: timestamp("set_at", { withTimezone: true }).defaultNow().notNull(),
});
```

Migration `packages/db/migrations/0017_profile_avatars.sql` created the table and then added both foreign keys:

```sql
CREATE TABLE "profile_avatars" (
  "user_id" text PRIMARY KEY NOT NULL,
  "reservation_id" text NOT NULL,
  "set_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "profile_avatars_reservation_id_unique" UNIQUE("reservation_id")
);
```

The primary key means one current avatar per user. The unique reservation constraint prevents one upload from becoming two users' avatars. The foreign keys require real user and media reservation rows, and cascading deletion defines what happens when either referenced row is removed.

This was additive because it introduced a new, empty table rather than rewriting existing account rows. Its Squawk suppressions are accompanied by focused files under `packages/db/migrations/reviews/`. Those records explain why validating the new foreign keys immediately did not scan existing rows and record the rollout and forward-fix plan. A suppression is not a general permission to ignore a warning. It needs a rule-specific review record.

The runtime repository at `apps/api/src/features/profiles/set-avatar/set-avatar.repository.ts` then uses a transaction and Drizzle query builders to lock the relevant rows, check that the upload is ready, and insert or update `profileAvatars`. The schema supplies query types. The applied PostgreSQL constraints still decide whether the final write is valid.

`0017_profile_avatars.sql` is an example to read, not a file to copy or edit. New work gets the next generated migration and its own review.

## Roles and connection boundaries

Dayli separates schema changes from application traffic:

| Role | Job |
| --- | --- |
| `migrator` | Owns application schema objects and Drizzle metadata. Guarded migration tools connect directly with this restricted role. |
| `app` | Reads and changes application rows. The deployed Worker uses it through Cloudflare Hyperdrive and cannot manage migration metadata or create tables. |

Local and test setup also create `lifecycle_worker` for narrowly reviewed background database operations. It is not a general replacement for `app` or `migrator`.

A provider owner may be needed to bootstrap restricted roles and grants in an empty hosted database. It must never become the Worker, Hyperdrive, or ordinary application credential. Application code should not receive ownership just because a permission error is inconvenient. Fix the grant or query at the correct boundary.

`apps/api/src/infrastructure/database/hyperdrive.ts` opens a request-scoped Drizzle client from the Hyperdrive binding and closes it after the operation. Migration commands do not use Hyperdrive because they need a direct, unpooled `migrator` connection and their own target checks.

## Change the schema safely

Before starting, install the locked dependencies and make sure `origin/main` is available locally. `pnpm db:check` uses `origin/main` as its default migration base outside GitHub Actions, so fetch it if the ref is stale or missing.

Then follow this workflow:

1. Change the owning file under `packages/db/src/schema/`. If you add a table, export it through `packages/db/src/schema/index.ts` and include it in the combined `schema` object when runtime queries need it.
2. Plan how the old application and the new application behave before, during, and after migration. Prefer a forward, additive step. Stop for review if the change rewrites data, removes anything, or adds a constraint to populated rows.
3. Check the migration paths in your working tree before generation. This prevents a new migration from being mixed with somebody else's output.

   ```bash
   git status --short -- packages/db/src/schema packages/db/migrations
   pnpm db:generate
   ```

   `pnpm db:generate` compares the Drizzle schema with the latest snapshot and writes a new SQL file, snapshot, and journal entry. It does not connect to PostgreSQL and does not apply the migration.
4. Read every generated change. Check the SQL operation, locks and table rewrites it may cause, treatment of existing rows, constraint names, foreign-key actions, and rollout order. Review the new `meta` snapshot and confirm `_journal.json` only gained one entry. Do not accept generated SQL merely because a tool wrote it.
5. Run the migration checks:

   ```bash
   pnpm db:check
   ```

   This checks Drizzle metadata, generated-schema drift, immutable history relative to the base ref, the append-only journal, Squawk findings and review records, plus current database-package inventory rules. It does not apply SQL to a database.
6. Exercise the migration against isolated PostgreSQL 18:

   ```bash
   bash scripts/verify-postgres.sh
   ```

   The verifier owns a disposable Docker Compose project on port `5433` by default. It provisions restricted roles and isolated test databases, checks and applies migrations, verifies the ledger, repeats application, and runs PostgreSQL integration tests. Its exit trap removes its volumes. See [PostgreSQL integration tests](./testing/integration-tests) for what this proves and what it does not.
7. After the isolated suite passes, apply the reviewed migration only to your persistent local development database:

   ```bash
   pnpm db:dev:up
   pnpm db:dev:migrate
   pnpm db:dev:verify
   ```

   These scripts load generated local credentials without printing or copying a connection string. The migration command applies all pending migrations to `localhost:5434/dayli_dev` as `migrator`. Verification opens a read-only transaction and checks the complete ledger.

   Ledger verification does not inspect every physical table, constraint, or grant. The disposable integration suite creates the schema from scratch and exercises the restricted roles, which is why both checks matter.
8. Run the focused repository tests and type checks for the feature that uses the new shape. Before review, follow [Testing](./testing) and the repository's [contribution guide](./contributing).

If the database change alters an API request or response, update the API contract and follow [Contracts and generated clients](./testing/contracts-and-generated-clients). A database migration alone does not require regenerating API clients. The public HTTP contract is the deciding boundary.

Never paste a database URL into documentation, a pull request, or a shell command saved in history. Use the repository scripts and protected secret stores.

## Local development, tests, and staging

The two local PostgreSQL setups have different lifecycles:

| Database | Address | Lifecycle | Use |
| --- | --- | --- | --- |
| Development | `localhost:5434/dayli_dev` | Persistent Docker volume | Accounts and posts you create while developing. |
| Test fixture | Port `5433` by default | Disposable verifier-owned volumes | Migrations and integration tests. |

`pnpm db:dev:down` stops development PostgreSQL but preserves its data. Do not reset it as routine troubleshooting. If setup fails, follow [Local setup](./local-setup) and [Environments](./environments) before considering deletion.

The test verifier must stay separate from development. Pointing a test suite at port `5434`, staging, or another shared database risks changing data that the suite does not own. The migration runner also checks the target, role, host, port, and database name before it writes.

Staging uses Neon PostgreSQL and a protected release process. Normal schema application belongs to the coordinated staging workflow, while `.github/workflows/run-database-migrations.yml` provides a separately protected manual path. Do not copy a credentialed workflow command into a local terminal or run a migration directly against staging. Read [Staging and manual checks](./testing/staging-and-manual-checks) and the internal maintainer runbook at `docs/dayli/database-migrations.md` when a reviewed change reaches that stage.

Dayli does not have a production environment today. The repository contains safeguards for a future production migration target, but that does not mean a production database or application release exists. Do not select that target until the team has provisioned and reviewed the environment.

## Inspect local data with Drizzle Studio

Drizzle Studio is an optional browser interface for viewing and editing rows. Start the development database first, then run:

```bash
pnpm db:dev:studio
```

The script binds Studio to the local development database on port `5434` using the restricted `app` role. Studio can change development rows, so treat edits as real local data changes. It is not a schema migration tool, and it must never point at staging. Stop it with `Ctrl-C` when you are finished.

For most database work, the safest loop is pleasantly ordinary: describe the schema, generate one migration, read the SQL, prove it on disposable PostgreSQL, then apply it to local development. Boring database changes are rather nice database changes.
