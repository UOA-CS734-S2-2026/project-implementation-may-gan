# Privacy and legal foundation

Status: additive database and domain contract only. This replay derives from source commits `35c4e03`, `d300795`, and `0a07fbe`, reconciled onto `main` at `1e36bdabc49bc837811a384d96fc05ee4d0f2487`.

## What this change adds

Migration `0019_privacy_legal_foundation` adds lifecycle state, short-lived management grants, legal-document versions, Terms acceptance, age declarations, registration intents, operator cases, export request state, private export cleanup tasks, and minimal purge receipts.

The schema stores lifecycle deadlines as `TIMESTAMPTZ`. Its checks require exact 168-hour cancellation, 336-hour cleanup, 24-hour ready-export, and 720-hour receipt intervals. Lifecycle and export generations are limited to JavaScript-safe integers. The domain helper takes a PostgreSQL-supplied UTC instant and rejects invalid values. It does not read a device or Worker clock.

The owner bootstrap reserves `lifecycle_worker`. It has no runtime credential, Worker binding, direct table grant, or physical-delete permission. The app role cannot delete `user`, read purge receipts or operator cases, or access export cleanup tasks. Reapplying migrator bootstrap preserves these denials.

## Explicitly not included

This change does not add hosted activation, migrations against a hosted database, secret configuration, an API route, a scheduled handler, an export builder, an object-store operation, a physical purge procedure, client UI, or provider verification.

Issue #199 remains the default-deny control. Lifecycle execution defaults to `disabled`; `report_only` and `execute` are contract vocabulary only. Do not enable either switch without a separately reviewed implementation, credentials, runtime binding, and local verification.

## Release gates

A migration requires database CODEOWNER review and the protected manual migration process. Migration checks require an immutable base commit that is an ancestor of the checked commit. Local disposable PostgreSQL is the only execution environment covered by this change. A later lifecycle implementation must first reconcile messaging retention, authorization, deletion ordering, object cleanup, provider retention, and legal publication review.
