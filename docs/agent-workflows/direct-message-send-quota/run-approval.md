# Run approval: Direct-message send quota

Status: approved for the exact files below. No run has started.
Recorded: 2026-10-03T12:23:27Z.
Repository: UOA-CS734-S2-2026/project-implementation-may-gan.
Base: latest origin/main at run preflight. PR target: main.
Runtime: eight hours per invocation, starting only when the runner starts. Retries cannot extend that deadline.
admin-bypass: authorized

## Explicit user decisions

The user approved the spec/plan, complete revised #255 and publication, auto-merge, automatic named-agent routing for both roles, latest origin/main and eight hours per invoked batch. Under the revised skill the user separately answered "bypass" after scope and limits were explained. The user requires hosted CI to pass; if paused/unavailable leave the PR unmerged.

## Ordered ticket and routing

| Order | Stable ID | GitHub | Merge mode | Scout | Implementor |
| --- | --- | --- | --- | --- | --- |
| 1 | GH-255 | #255 | auto-merge | scout-sol | implementor-sol |

The quota spans transactions, authorization, idempotency and shared lock order, so the initial automatic risk route is Sol. Approved automatic policy also permits scout-luna/implementor-luna for routine work and scout-terra/implementor-terra for intermediate/cross-cutting work. Check this approval before every spawn and record any justified reroute within the policy. Independent correctness review uses the named reviewer role.

## Dependency and integration

Depends only on the implemented messaging foundation. It is not a functional dependency of #131 and does not require notification credentials. Coordinate shared writer/schema/composition files with #259/#260 work using clean integrated main. Do not silently import unmerged changes from the current dirty branch.

## Merge and bypass limits

- Auto-merge requires passing hosted CI on the exact head, local verification, independent review with no unresolved findings, and the required approving PR review.
- Bypass is authorized only for the approved GH-255 auto-merge PR when branch protection alone blocks an otherwise eligible merge. GitHub can override the protected review requirement, but CONTRIBUTING.md still requires an approving review; it is not waived.
- Missing/failed checks or review, unresolved findings, sensitive changes awaiting owner review or explicit no-bypass policies still block merge.
- No bypass for unrelated PRs or changed inputs without reapproval. Record the actual PR/head and passing-gate evidence. Follow rebase-and-merge guidance; do not force push main or change protection settings.

## Restrictions

No real credential use, remote configuration/migration writes, hosted workflow dispatch, staging/production deployment or release activation. Apply tests only to isolated fixtures. Use a clean worktree, preserve unrelated current edits and the unrelated active batch, and assign the additive migration number after integrating current main. Preserve deployed migration history and completed/closed issues.

Publish planning artifacts in a clean PR before relying on their repository links. Approval-input changes require reapproval; no previous approval was inherited for this revision.

## SHA-256 approved inputs

| File relative to this directory | SHA-256 |
| --- | --- |
| spec.md | 3e2d81592eef00d9c28879e9c9e8b481ade18fb78d630ac6d5f50a260566d16f |
| plan.md | 3fdeedebedb075131944a1669138776a9a02eeabfbdec7ffb85a76ec3ea94d6c |
| tickets/GH-255.md | 3d57470696e3cb38e29422fbac4c4ae27e66a4bbd99ee4bd689ad080e05b1c1a |

## Five-PR follow-up

The user subsequently requested continued implementation toward merging the five discussed PRs. See [the bounded merge follow-up](../messaging-merge-follow-up-approval.md). Original batch deadlines are not extended, downstream tickets are not restarted, and approved input digests remain unchanged.

## Latest owner authorization amendment

The subsequent user instruction explicitly authorizes admin bypass of the GitHub approving-review requirement for the five discussed PRs, subject to exact-head passing hosted CI, local verification, clean independent review and migration integration. See [the recorded merge amendment](../messaging-admin-merge-approval.md) and [scoped automatic staging operation approval](../messaging-staging-operation-approval.md). This latest amendment supersedes only the conflicting earlier approving-review and automatic-staging restrictions for those PRs. It does not change any approved spec/plan/ticket SHA-256 entry, authorize unrelated PRs or live push acceptance, or assert that a human personally performed a review.
