---
title: PostgreSQL integration tests
description: Check Dayli repositories, migrations, permissions, and concurrency against a disposable PostgreSQL database.
---

# PostgreSQL integration tests

Integration tests check whether separate parts of an application work together. A database integration test runs application code against a real test database rather than replacing the database with a fake.

This matters because a fake can return exactly what the test expects while the real database rejects the query or stores something different. Integration tests catch problems in those connections, including incorrect queries, permissions, and changes to the database structure.

Dayli uses PostgreSQL integration tests for saving posts, managing friendships, and storing messages. One example checks two posting transactions for the same author: the real database must make them wait their turn so both cannot save a post for the same day. A unit test alone cannot prove that database behaviour.

Run commands on this page from the repository root.

## Where Dayli uses these tests

Dayli has database integration tests in both the database package and API features:

- `packages/db/src/migrations.integration.test.ts` checks migrations, role permissions, transaction rollback, advisory locks, and prompt constraints.
- `packages/db/src/relationships.integration.test.ts` checks relationship constraints and concurrent changes.
- `apps/api/src/features/posts/create-post/create-post.repository.integration.test.ts` checks daily-post persistence through the PostgreSQL repository.
- `apps/api/src/features/posts/create-post/create-post.advisory-lock.repository.integration.test.ts` checks that concurrent post transactions serialize on the author's advisory lock.
- `apps/api/src/features/relationships/shared/relationships.repository.integration.test.ts` checks the relationship repository against real tables and constraints.
- Messaging repository tests use the same layer under `apps/api/src/features/messaging/**/__tests__/*.repository.integration.test.ts`.

The runner that provisions their databases is `scripts/verify-postgres.sh`. The Compose service it owns is defined in `packages/db/docker-compose.yml`.

## Run the complete disposable suite

Docker must be running. Then use the repository verifier rather than assembling database URLs by hand:

```bash
bash scripts/verify-postgres.sh
```

The script starts a uniquely named Docker Compose project, using port `5433` unless `VERIFY_POSTGRES_PORT` selects another local port. It creates separate databases for suites that need isolated state, applies migrations, verifies the schema, and runs the database package and API PostgreSQL tests. Its exit trap stops the Compose project and removes its volumes, even after a failed check.

This is deliberately different from the persistent development database on port `5434`. The verifier supplies local migrator, app, and lifecycle-worker roles so tests can check that each role has only the permissions it needs.

A normal `pnpm test` is not a substitute. Several integration files skip when their required test URL or opt-in variable is absent, and the API's ordinary Vitest configuration excludes its PostgreSQL suite. A skipped suite does not prove the database behavior passed.

## Example: one author, two post transactions

Dayli allows one post per author and Auckland day. If two create requests run together, checking for an existing row before inserting is not enough. The repository takes a transaction-scoped PostgreSQL advisory lock for that author.

`create-post.advisory-lock.repository.integration.test.ts` opens two independent database connections. The first transaction acquires the old raw lock and waits. The second calls the current repository method and must remain blocked until the first commits:

```ts
const firstAttempt = first.db.transaction(async (tx) => {
  await tx.execute(sql`
    select pg_advisory_xact_lock(
      hashtextextended('posts:author:' || ${authorId}, 734)
    )
  `);
  firstEntered.resolve();
  await releaseFirst.promise;
});

const secondAttempt = createPostgresDailyPostStore(second.db)
  .withAuthorTransaction(authorId, async () => {
    secondEntered.resolve();
  });

expect(secondEntered.settled).toBe(false);
```

The file also checks rollback. After the first transaction throws, PostgreSQL must release the transaction lock so the waiting repository call can continue. A unit test can check that `withAuthorTransaction` asks for a lock, but only PostgreSQL can prove the waiting and release behavior.

## Fixtures and cleanup

Give each test data it can identify, usually with `crypto.randomUUID()`. Clean inserted rows in `afterAll`, `afterEach`, or `finally`, and close every database connection. Cleanup inside the test still matters because several tests can share one disposable database during a run.

Use a separate database when tests intentionally change schema state, race a migration, or need roles that another suite could disturb. `scripts/verify-postgres.sh` already provisions databases for relationships, messaging, lifecycle and export, privacy preflight, messaging migration races, compatibility, and post advisory locks.

Integration files also guard their targets. For example, the advisory-lock suite accepts only a local database whose name matches its test pattern. The migration suite requires `localhost`, the selected verification port, and `/dayli_test`. Keep those checks when adding a suite. Never loosen one to make a Neon or development URL work.

When a new suite needs its own database, add it to the verifier rather than documenting a shared credential. The verifier's `ADDITIONAL_ISOLATED_DATABASES` hook accepts names matching `dayli_[a-z0-9_]+_test`, but a permanent suite should still have reviewed, explicit setup and environment wiring.

## What belongs at this layer

Use a PostgreSQL integration test when the answer depends on:

- SQL generated by a repository or Drizzle query
- a unique, foreign-key, check, or not-null constraint
- database roles and grants
- transaction commit or rollback
- advisory locks or concurrent sessions
- applying and replaying migrations

Keep parsing, policy decisions, and straightforward service branches in unit tests. Put browser navigation in the [end-to-end guide](./end-to-end-tests). Code that needs Durable Objects, WebSockets, or Worker service bindings belongs in [Worker runtime tests](./worker-runtime-tests).

## Limits

These tests use local PostgreSQL in Docker. They do not prove that a staging Worker can reach Neon through Hyperdrive, that staging has the expected secrets, or that a deployed migration has run. They also do not measure production-sized data or query load.

Use the reviewed [staging checks](./staging-and-manual-checks) for deployed resource proof. Dayli does not currently provide a general load-test command. Do not turn the disposable integration runner into one or point it at shared data.
