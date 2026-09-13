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

## Future Worker binding

When the API begins making database requests, provision a distinct Hyperdrive resource per environment with query caching disabled. Add its binding through the approved Cloudflare environment/dashboard configuration; do not commit database URLs, passwords, or environment-specific resource IDs. Verify that binding through isolated staging before deploying dependent API routes.
