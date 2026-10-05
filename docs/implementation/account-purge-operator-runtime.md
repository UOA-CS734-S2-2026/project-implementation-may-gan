# Account purge operator runtime

Account purge execution is not active. The public API and scheduled Worker have no execute entry point. The deletion request route also stays disabled.

## Scheduled report

The existing Worker cron runs aggregate maintenance only when both conditions are true:

1. `ACCOUNT_PURGE_EXECUTION_MODE` is exactly `report_only`.
2. `EXPORT_WORKER_HYPERDRIVE` is present, differs from `HYPERDRIVE`, and connects as `lifecycle_worker`.

Any missing, malformed, or differently cased value disables the report. Report mode calls `report_account_purge_cleanup()` and `report_account_purge_operator_control()`. It does not claim work, read object keys, prune receipts, or call R2.

The report exposes due, failed, leased, and terminal counts. Logs contain those counts only. A nonzero terminal count needs operator investigation. A missing control row, or an expired unpaused control, emits an error even when every task count is zero.

## Pause and recovery

Migration `0059_account_purge_operator_controls.sql` creates one control row in the paused state. Neither `app` nor `lifecycle_worker` has table access. Only the database owner can call `set_account_purge_operator_pause`.

The migration revokes claim, authorization, completion, retry, and receipt deletion from `lifecycle_worker`. The control procedure and destructive procedures are database-owner-only foundations. Do not open an execution window in staging or production in this release.

The owner can force the persistent state back to paused during isolated development or incident preparation:

```sql
select public.set_account_purge_operator_pause(
  true,
  null,
  'incident CASE-ID',
  'operator identity'
);
```

Pause fences database leases, but that does not make a future provider call atomic with the pause. No deployed role can use these procedures in this release. Storage failures stop owner-driven isolated retries after eight claims and appear in both terminal aggregate counts. Recovery from a terminal failure needs a separate reviewed forward migration or owner procedure. Do not edit task rows during an incident.

A later executor needs a durable in-flight permit and drain protocol. Each claim and provider permit must bind to the same operator generation. Pausing must block new permits, invalidate every older generation, and wait for issued permits to drain before it reports quiescence. A renewed execution window must not authorize a lease from an earlier generation. The staging proof needs concurrent pause, resume, renewal, and provider-start stress tests for this protocol.

## Staging proof prerequisites

There is no staging execute entry point in this change. Do not set `ACCOUNT_PURGE_EXECUTION_MODE=execute`; the scheduled runtime rejects it.

A later executor must remain separate from the public and scheduled Worker. Before adding or invoking it, capture all of the following in a protected workflow:

* an immutable deployed commit SHA that matches the reviewed source
* the exact staging database identity and migration head
* a synthetic owner ID created for this proof, with a guard that rejects every other owner
* external approval tied to the proof run and control reason
* an approved short resume window, followed by a pause in cleanup handling
* R2 credentials restricted to the staging bucket and synthetic object namespace
* aggregate before and after reports, lease recovery evidence, and delayed export reconciliation evidence
* confirmation that signup, account deletion admission, and production targets remain disabled

The proof must cover a provider failure, pause during a lease, stale lease recovery, terminal monitoring, and a multipart export completion that appears after the first delete. It must also show that the retained export cleanup task completes its later absence reconciliation after account finalization.

The database schema contains cancellation and purge intervals, but this runtime milestone does not prove those timings in a deployed environment. Do not publish or activate timing guarantees until the protected staging proof records the observed boundaries.

## Remaining activation work

A separate change must build the protected staging executor, add the generation-bound permit and drain protocol, bind a staging-only R2 client, enforce immutable SHA and database target checks, and restrict claims to one approved synthetic owner. Production execution also needs its own approval and incident process. None of those controls can be inferred from the cron configuration or ordinary Worker secrets.
