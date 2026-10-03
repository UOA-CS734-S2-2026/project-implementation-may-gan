# Run approval: Push readiness and release evidence

Status: approved for the exact files below, with manual external gates. No run has started.
Recorded: 2026-10-03T12:23:27Z.
Repository: UOA-CS734-S2-2026/project-implementation-may-gan.
Base: latest origin/main at run preflight. PR target: main.
Runtime: eight hours per invocation, starting only when the runner starts. Retries cannot extend that deadline.
admin-bypass: authorized

## Explicit user decisions

The user approved the spec/plan, complete ticket bodies and publication, all-ticket auto-merge, automatic named-agent routing for scouts and implementors, latest origin/main and eight hours per invoked batch. Under the revised skill the user separately answered "bypass" after batch scope and limits were explained. Hosted CI must pass; if unavailable/paused, leave PRs unmerged.

## Ordered tickets and routing

| Order | Stable ID | GitHub | Merge mode | Scout | Implementor | Execution class |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | PR-001 | #264 | auto-merge | scout-terra | implementor-terra | Mock-tested readiness tooling |
| 2 | GH-141 | #141 | auto-merge | scout-sol | implementor-sol | Manual external owner gate |
| 3 | GH-130 | #130 | auto-merge | scout-sol | implementor-sol | Manual physical-device gate |
| 4 | GH-131 | #131 | auto-merge | scout-terra | implementor-terra | External staging release gate |

The selected named agents may prepare allowed repository artifacts only. They cannot perform gated external work without separate operation approval. Do not spawn implementors just to wait for unavailable devices/access.

Automatic policy authorizes scout-luna/implementor-luna for routine work, scout-terra/implementor-terra for intermediate/cross-cutting work and scout-sol/implementor-sol for highest-risk work. Routes above are initial assignments. Check approval before every spawn and record any risk-based reroute within this policy. Independent correctness review uses the named reviewer role.

## Dependencies

PR-001 -> GH-141. GH-141 plus MN-003 (#261), MN-004 (#262), and MN-005 (#263) -> GH-130 -> GH-131.

Notification prerequisites are governed by `../generic-mobile-notifications/run-approval.md`; this batch must not duplicate or silently implement their scope. GH-255 remains non-blocking for GH-131. Quiet hours #265 is blocked and excluded.

Owner Firebase/APNs configuration, approved staging accounts/builds, physical Android/iOS devices and live-operation approval are external prerequisites. A mock readiness pass cannot satisfy OAuth/device/deployed evidence.

## Merge and bypass limits

- Eligible repository/evidence PRs need passing hosted CI on the exact head, local verification, independent review with no unresolved findings, and the repository-required approving PR review.
- Bypass is authorized only for these four approved auto-merge tickets when protection alone blocks an otherwise eligible merge. GitHub can override its branch review requirement, but CONTRIBUTING.md still requires an approving review; that review is not waived.
- Missing/failed checks or review, unresolved findings, sensitive changes awaiting owner review and explicit no-bypass policies still prevent merge.
- No scope for unrelated PRs or changed tickets without reapproval. Follow rebase-and-merge guidance. Do not force push main or change protection settings.
- Record any bypass with the actual PR/head and passing-gate evidence. Merge/evidence approval is not deployment or release approval.

## Restrictions

No provisioning, credentials, OAuth with real credentials, hosted workflow dispatch, Cloudflare/Firebase writes, live notifications, physical-device actions, staging/production deployment or release activation is authorized by this batch. Request exact operation/target approval first. Leave GH-141/GH-130/GH-131 blocked until their prerequisites and permissions exist.

Use isolated clean worktrees, preserve the dirty original tree and unrelated active batch. No changes to closed #127, completed issue history, or other contributors' PR scope. Publish planning artifacts through a clean PR; do not commit unrelated files. Changed approval inputs or meaningful dependent scope require reapproval.

## SHA-256 approved inputs

| File relative to this directory | SHA-256 |
| --- | --- |
| spec.md | b707671a6e05ff66d6ad69851ecb6136d31230d255b2d4dc11d29d35d0faf3ba |
| plan.md | 2b06567656ea022b9d3ece3fd4ad544e7d043b92e5bfb8ab83233931b015cb52 |
| tickets/PR-001.md | 156584e7ac24680bf305c8f29212b517c63b7dd34aed2ed399159faec2ef4904 |
| tickets/GH-141.md | fe453dd531315c646971a593cbba85b7c8ae00defc75a4c8e021980618b08ba4 |
| tickets/GH-130.md | 2f1ac0f966de75618c3fb84a8f3df441ef0c02602d1e6d726486bfe43894ccdd |
| tickets/GH-131.md | 5c1086dfd02f74c754bed4c4dff51e6826e4ac6e56e54848032a725b43775468 |
