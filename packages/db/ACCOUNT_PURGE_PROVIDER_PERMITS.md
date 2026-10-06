# Account purge provider permits

Migration `0060` adds a database admission and drain protocol for future account-purge R2 operations. It does not enable purge execution and grants no destructive or permit function to `app` or `lifecycle_worker`.

## State model

The singleton control row moves through `active`, `draining`, `paused`, and `incident`. Every activation or renewal increments the operator epoch and fences existing cleanup leases. A permit records the cleanup task, owner, lifecycle generation, operator epoch, worker lease, operation kind, and a deadline of at most two minutes.

`start_account_purge_provider_operation` is the operation admission point. It serializes briefly with pause on the control row and commits a `started` permit before any provider request. No database lock is held during a remote call. Once pause has acquired the control row, admission is closed. A request admitted just before pause can still reach R2 after pause commits, so the durable permit keeps the state in `draining` rather than pretending the provider is quiet.

Workers must acknowledge a provider response with `finish_account_purge_provider_operation`. A response after the permit deadline, worker crash, timeout, or uncertain multipart abort becomes `unresolved`. `refresh_account_purge_provider_drain` then puts the control in `incident`. Resume is rejected while any permit is started or unresolved.

An authenticated database owner must investigate R2 and call `reconcile_account_purge_provider_operation` with provider evidence. Resolution values are operation-bound. In particular, `abort_export_multipart` accepts only `multipart_reconciled`. A finite object-absence check is not represented as proof that no late provider operation can complete. The report therefore always returns `external_provider_quiescence_claimed = false`, even when database admission is fully drained.

Raw task, owner, and lease identifiers exist only while a permit is started. Completion, failure, expiry, and reconciliation erase them and retain SHA-256 digests for correlation. Closed permits expire after 30 absolute days and can be deleted in bounded owner-only batches. Unresolved incidents have no automatic retention deadline. They must be reconciled first so evidence is never silently discarded.

## Current release posture

The scheduled Worker remains report-only. `requestEnabled` remains false, no executor is wired, and all permit, pause, reconciliation, claim, and destructive procedures are denied to both runtime roles. A separate staging milestone must supply an executor role, adapter behavior, authenticated operator workflow, provider-side reconciliation evidence, and fault-injection proof before any runtime execution grant is safe.
