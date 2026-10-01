# Messaging identity retention, phase one

This schema-only change supersedes the database portion of PR #174. It adds a `messaging_participants` row for each user without changing any deployed messaging query or the existing user references on conversations, memberships, messages, reactions, or conversation changes.

A participant starts with the same opaque ID as its user. The row contains only that ID, an active-user mapping, a state, and a creation timestamp. It does not contain profile fields, credentials, sessions, provider accounts, or message text.

Migration `0020_messaging_participant_identity_foundation` takes a transactional `SHARE ROW EXCLUSIVE` lock on `user` at the outset. That is the same mode needed later for trigger installation, so the migration never upgrades its lock while a `SELECT FOR UPDATE` holder is trying to write. It backfills existing users, creates a participant for each later user insert, and detaches the mapping before a user row is removed. The lock blocks conflicting signup and deletion writes until both triggers are installed. A detached row has `state = 'deleted'` and a null `user_id`. The migration does not delete conversations, messages, reactions, participants, or any other messaging row.

The existing messaging tables still reference `user`. That is intentional. The deployed API continues to use those columns, so this change can merge without making an automatic staging API deployment depend on a hosted schema migration. The `app` and `lifecycle_worker` roles have no access to `messaging_participants` in this phase. Reapplying `bootstrap-migrator.sql` preserves that restriction.

## Pre-merge blocker for the runtime phase

Do not merge a participant-dependent API runtime change until staging has applied `0020_messaging_participant_identity_foundation`, its sanitized evidence is reviewed, and the unchanged API passes a Hyperdrive check as `app`. Staging applied and verified `0019_privacy_legal_foundation` in run `36825132480`. The owner approved a later staging run of `0020` after this PR merges and its preflight is reviewed. That approval does not authorize production migration or a runtime cutover.

Before that runtime PR can merge, reviewers need the protected staging migration evidence, a Hyperdrive compatibility check as `app`, and a review of the schema transition. There is no hidden feature flag or fallback query in this phase. The runtime is disabled by absence, not by a switch that might send one request down an unsafe path.

## Planned cutover

The next migration must add participant references alongside the current user references. It must backfill both forms, keep them consistent during the API transition, and leave the current user-reference columns in place until staging proves the new runtime. The runtime can then read and write participant identities while preserving the current user IDs for active delivery and authorization.

Only after that cutover can a separate deletion review remove the cascading messaging user references. That review must prove that a surviving participant can find the direct conversation and retained history. It must project a fixed unavailable-account label only when the participant has no active user mapping. It must not join a deleted profile.

A later inspection query may identify conversations with no active participant. It must remain read-only. It cannot authorize deletion, and it cannot remove a conversation while another participant survives.

Message bodies remain identifying content. Retaining them for the surviving participant is not anonymization. Export policy, lifecycle scheduling, reauthentication, and account deletion are outside this change.

## Hosted rollout

1. Review and merge this schema-only PR.
2. Run the already approved `0020` staging migration only from the reviewed `main` commit after merge and preflight. Do not dispatch it from this worktree or use a direct hosted connection.
3. Review sanitized migration evidence and test the unchanged messaging API through Hyperdrive as `app`.
4. Open the later runtime cutover only after those checks pass. Production migration needs its own approval.
