# Hosted mutation hold

`.github/hosted-mutation-authorization.json` is an operational switch for GitHub Actions jobs that can change a hosted service. It is separate from legal, privacy, release, or environment approval.

The checked-in state is `deny`. It blocks staging API and web deployment, Worker secret synchronization, the Hyperdrive proof, hosted database migrations, and preview Worker cleanup. Local PostgreSQL workflows remain local and are not part of this hold.

Each held workflow runs a credential-free guard first. The guard checks out the current `main` ref, requires the queued commit to equal that ref, then reads the manifest. A successful CI run for an older commit cannot deploy after `main` advances to a hold. `workflow_run` paths also require a same-repository main run, so a fork cannot supply an authorization source.

## Future authorization

An owner must review the intended release commit and hosted mutation before adding a separate authorization commit on `main`. That authorization commit replaces the deny file with:

```json
{
  "version": 1,
  "state": "allow",
  "commit": "the-40-character-reviewed-release-commit-sha"
}
```

The authorization commit must be the live `main` tip and the named release commit must be in its history. Held deployment and migration jobs check out the named release commit. This separate authorization commit avoids a circular attempt to embed its own Git SHA in its content. Any missing field, extra field, unsupported version, malformed JSON, unknown commit, or changed main tip denies the job. Restore `deny` in the next reviewed main commit when the authorized operation is complete.

This process does not create an environment approval or satisfy any separate approval requirement. It only permits the workflow graph to reach the job that already owns the protected environment and its credentials.

## Already-running jobs

Changing the hold to `deny` or restoring it cannot stop a mutation job that already passed its guard and received credentials. Before merging a hold change, the owner must check active and queued hosted mutation runs and decide whether to cancel them separately. This hold does not cancel jobs.
