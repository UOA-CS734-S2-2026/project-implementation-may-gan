# Messaging identity retention, phase one

This schema-only change supersedes the database portion of PR #174. It adds a `messaging_participants` row for each user without changing any deployed messaging query or the existing user references on conversations, memberships, messages, reactions, or conversation changes.

A participant starts with the same opaque ID as its user. The row contains only that ID, an active-user mapping, a state, and a creation timestamp. It does not contain profile fields, credentials, sessions, provider accounts, or message text.

Migration `0020_messaging_participant_identity_foundation` takes a transactional `SHARE ROW EXCLUSIVE` lock on `user` at the outset. That is the same mode needed later for trigger installation, so the migration never upgrades its lock while a `SELECT FOR UPDATE` holder is trying to write. It backfills existing users, creates a participant for each later user insert, and detaches the mapping before a user row is removed. The lock blocks conflicting signup and deletion writes until both triggers are installed. A detached row has `state = 'deleted'` and a null `user_id`. The migration does not delete conversations, messages, reactions, participants, or any other messaging row.

The existing messaging tables still reference `user`. That is intentional. The deployed API continues to use those columns, so this change can merge without making an automatic staging API deployment depend on a hosted schema migration. The `app` and `lifecycle_worker` roles have no access to `messaging_participants` in this phase. Reapplying `bootstrap-migrator.sql` preserves that restriction.

## Pre-merge blocker for the runtime phase

Do not merge a participant-dependent API runtime change until staging has applied `0020_messaging_participant_identity_foundation`, its sanitized evidence is reviewed, and the unchanged API passes a Hyperdrive check as `app`. Staging applied and verified `0019_privacy_legal_foundation` in run `36825132480`. The owner approved a later staging run of `0020` after this PR merges and its preflight is reviewed. That approval does not authorize production migration or a runtime cutover.

Before that runtime PR can merge, reviewers need the protected staging migration evidence, a Hyperdrive compatibility check as `app`, and a review of the schema transition. There is no hidden feature flag or fallback query in this phase. The runtime is disabled by absence, not by a switch that might send one request down an unsafe path.

## Compatibility expansion

Migration `0021_messaging_participant_compatibility` adds nullable participant references beside every messaging user reference that will later need durable identity: direct pairs, initiator, memberships, senders, reactions, and conversation-change members. It backfills active rows and database triggers write the matching participant value for every legacy insert or update. The old Worker keeps using only user columns. The triggers make its rows ready for the later runtime without asking it to know about the new columns.

The user-reference columns, their unique constraints, and their cascading foreign keys remain. The outbox, push devices, and socket tickets also remain user-scoped. This migration does not enable physical account deletion, alter lifecycle procedures, or make a message survive a physical user delete. Today, the existing user foreign keys still cascade messaging rows if another system deletes a user.

The participant API can only read and write these references after staging has applied the readiness migration below, reviewers have checked the migration evidence, and the old API has passed its compatibility checks. A later contract migration may remove legacy cascading references only after a separate deletion review proves retained history, inactive-peer projection, delivery authorization, and rollback behavior.

## Participant-key readiness

Migration `0023_polite_sway` replaces the `0021` trigger functions without changing their names. Old Worker inserts still derive participant keys from user IDs. An unrelated old Worker update keeps the existing participant key. An explicit participant key that does not match its active legacy user fails with PostgreSQL constraint error `23514`. The migration repairs only null participant keys, validates participant presence, direct-pair order, and initiator membership, then adds participant-key uniqueness for conversations, memberships, messages, and reactions.

The migration takes `ACCESS EXCLUSIVE` on `conversations` first, then takes `ACCESS EXCLUSIVE NOWAIT` locks on the dependent messaging tables before replacing triggers or repairing rows. The conversation gate blocks reads and writes. That outage is intentional: it prevents the former cross-table deadlock with a Worker that locks a conversation, writes a message or reaction, then updates the conversation. A lower-table-first Worker makes a dependent `NOWAIT` lock fail with `55P03`, and the transaction rolls back for a retry.

The unique constraints build transactional indexes because the manual migrator cannot issue `CREATE INDEX CONCURRENTLY`. Before a forward staging apply with `0023` or `0024` pending, the protected workflow reads `pg_total_relation_size` for `conversations`, `conversation_members`, `messages`, `message_reactions`, and `conversation_changes` in a read-only transaction. It fails closed if the migration ledger, roles, or tables are unknown, or if their combined size exceeds 16 MiB. Each migration repeats its check after it holds final locks and before it repairs data or builds constraints. That closes the gap between the read-only preflight and the migration. The Actions output reports only size categories and the fixed cap, not byte counts. That cap is deliberately conservative: this first staging proof limits the duration of the required full conversation gate and transactional index builds to a small, measurable data set. Staging cannot override it. Production remains manual and must separately measure all five tables, confirm the five minute per-statement timeout and five second lock timeout, and obtain its existing approvals. Its optional `production_messaging_0024_size_cap_bytes` input is an explicit reviewed five-table cap that cannot be below 16 MiB. A statement timeout does not bound the migration's total transaction duration. This migration has a bounded staging read outage and may fail cleanly for retry. Do not claim zero downtime from it.

`0023` does not detach user foreign keys, change primary keys, enable a purge procedure, or grant either runtime role user deletion. `app` remains read-only on `messaging_participants`, and `lifecycle_worker` remains denied.

## FK detachment contract

Migration `0024_lying_eddie_brock` changes exactly seven direct messaging user foreign keys to `ON DELETE SET NULL`: the three conversation user references, member user, message sender, reaction user, and conversation-change member. It makes the six previously required legacy fields nullable. Durable participant references remain required by their existing checks, pair order remains checked, and explicit participant replacement or a participant and legacy-user mismatch still fails with `23514`.

Membership and reaction primary keys move to `(conversation_id, participant_id)` and `(message_id, participant_id)`. Their old user pairs remain named unique constraints so rolling Workers can keep their existing `ON CONFLICT` targets. The outbox recipient user cascade remains unchanged. This migration does not add a purge procedure, a worker privilege, an export behavior, or legal publication.

The staging preflight remains a mandatory read-only, combined five-table 16 MiB gate, now keyed to `0024`. It uses bounded transaction-local lock, statement, and idle-in-transaction timeouts before catalog queries. Under the final locks, `0024` repeats the same combined check before it replaces foreign keys or builds primary-key and unique indexes. It locks `user` in `SHARE ROW EXCLUSIVE` mode first, then `conversations` and the lower messaging tables in worker order. The migration therefore blocks signup, profile, account, and deletion writes on `user` for its full transaction, as well as reads and writes to the five messaging tables during its final locked work. A lower-table-first writer fails safely with `55P03`; a cap breach rolls back the whole migration. A raw physical deletion is not a supported production lifecycle operation: before any future purge work, its implementation must take conversation-first locks and retry transaction deadlocks.

A later inspection query may identify conversations with no active participant. It must remain read-only. It cannot authorize deletion, and it cannot remove a conversation while another participant survives.

Message bodies remain identifying content. Retaining them for the surviving participant is not anonymization. Export policy, lifecycle scheduling, reauthentication, and account deletion are outside this change.

## Hosted rollout

1. Review the 16 MiB cap and the intentional staging read outage before merging this schema-only PR.
2. After green `main` CI, let the protected coordinated staging release capture the immutable commit. Its forward path checks the target and reviewed plan, then runs the read-only 0024 size preflight before `db:migrate`; the migration repeats the cap check under its final locks. Do not use a direct hosted connection or a worktree dispatch to bypass it.
3. Review the sanitized staging migration evidence and test the unchanged messaging API through Hyperdrive as `app`.
4. Open the later runtime cutover only after those checks pass. Production remains a separately approved manual migration with its existing confirmations and a recorded five-table size measurement.
