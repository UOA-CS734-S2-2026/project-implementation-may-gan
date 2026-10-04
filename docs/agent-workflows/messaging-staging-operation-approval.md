# Messaging staging operation approval

## User decision

During the follow-up E2E-fix request, the user selected implementor-sol and separately chose "Authorize these automatic staging operations" in the operation-approval question.

This approval covers only automatic staging operations triggered by merging eligible PRs #267, #269, #271, #272 and the focused E2E fix PR in UOA-CS734-S2-2026/project-implementation-may-gan.

## Authorized automatic operations

After passing tests and required reviews, successful main CI may run the existing protected staging release path to apply reviewed pending staging migrations, synchronize allowlisted secrets, deploy dayli-api-staging and the configured staging web Worker, and run the Hyperdrive proof.

The existing protected staging Environment and target-validation gates remain in force. Capture and inspect actual PR heads, migration suffixes and automatic workflow results. Do not apply unknown or unreviewed pending changes merely because they exist on main.

## Exclusions and remaining gates

This does not authorize production, Firebase/APNs provisioning, live OAuth readiness, notification sends, physical-device tests, key rotation, manual workflow dispatch, protection mutation or unrelated PR merges. No credential values may be printed or committed.

Admin bypass cannot replace the approving PR review or sensitive-change owner review required by the existing batch approvals and CONTRIBUTING.md. Failed or missing checks, unresolved findings and migration conflicts still prevent merging. Planning PR publication approval did not independently waive its review requirements.

The two schema PRs currently allocate migration 0051. Whichever integrates second must first rebase and regenerate or renumber its unmerged addition, then rerun verification and review. Preserve deployed migration history.

Firebase/APNs setup guidance is informational. Supplying instructions is not authorization for the agent to perform provisioning or live tests. Keep push delivery disabled until the notification consent/dispatch/client prerequisites and separate live-operation approvals are ready.
