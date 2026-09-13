# Dayli database package

This package owns the Drizzle/PostgreSQL connection helpers and smoke check.

## Local smoke check

Use an isolated development PostgreSQL database and keep its credentials outside Git:

```bash
DATABASE_URL="postgres://..." pnpm --filter @dayli/db db:check
```

The command reads `DATABASE_URL` at execution time, runs `select 1 as ok` through Drizzle, closes the connection, and never prints the connection string. A missing URL fails closed.

## Evidence

Run the smoke check against an approved isolated local or staging database before a release that depends on PostgreSQL. Record the command outcome without the connection string, credentials, database host, or private data. CI intentionally does not run it: the repository contains no database credentials and no shared database is available to untrusted pull requests.

## Workers Hyperdrive check

The API's credentialed staging check uses `createHyperdriveDatabase(env.HYPERDRIVE)`. It creates the Drizzle client for one Worker service-binding call, runs `select 1 as ok`, and closes it in `finally`.

See [`apps/api/README.md`](../../apps/api/README.md) for the protected staging setup and command. The check is not part of ordinary CI. It uses an isolated staging database, a real deployed Worker binding, and no public HTTP route.
