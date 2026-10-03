# Run approval: Generic mobile notifications

Status: approved for the exact files below. No run has started.
Recorded: 2026-10-03T12:23:27Z.
Repository: UOA-CS734-S2-2026/project-implementation-may-gan.
Base: latest origin/main at run preflight. PR target: main.
Runtime: eight hours per invocation, starting only when the runner starts. Retries cannot extend that deadline.
admin-bypass: authorized

## Explicit user decisions

The user approved the specification/plan, ticket slices, complete bodies and GitHub publication; selected all eligible tickets as auto-merge; authorized automatic named-agent routing for both scouts and implementors; selected latest origin/main and eight hours per invoked batch. Under the revised AGaw skill the user separately answered "bypass" to the batch preauthorization question, after the scope and protection limits were explained. The user explicitly requires hosted CI to pass; paused/unavailable CI leaves PRs unmerged.

Quiet-hours policy remains outside this approval. The user approved deferring it from #34 and keeping it as a blocked follow-up. The account preference explicitly gates legacy and new delivery alike.

## Ordered tickets and routing

| Order | Stable ID | GitHub | Merge mode | Scout | Implementor |
| --- | --- | --- | --- | --- | --- |
| 1 | MN-001 | #259 | auto-merge | scout-sol | implementor-sol |
| 2 | MN-002 | #260 | auto-merge | scout-sol | implementor-sol |
| 3 | MN-003 | #261 | auto-merge | scout-sol | implementor-sol |
| 4 | MN-004 | #262 | auto-merge | scout-terra | implementor-terra |
| 5 | GH-034 | #34 | auto-merge | scout-terra | implementor-terra |
| 6 | MN-005 | #263 | auto-merge | scout-sol | implementor-sol |

Automatic policy authorizes scout-luna/implementor-luna for routine well-scoped work, scout-terra/implementor-terra for intermediate or cross-cutting work, and scout-sol/implementor-sol for the hardest or highest-risk work. The initial routes above reflect consent/session/preview/visibility risk. Recheck approval before every spawn; route adjustments must stay within this approved policy and be recorded. Independent correctness review uses the named reviewer role.

## Dependency and external gates

MN-001 -> MN-002 -> MN-003. MN-001 also directly supports MN-003.
MN-002 -> MN-004 and GH-034 -> MN-005.
MN-004 and GH-034 each depend directly on MN-002.

Local implementation can use mocks without credentials. Live staging/device proof requires #141 and separately approved external operations, then #130/#131 in the release batch. MN-QH-001 (#265) is blocked and excluded from execution and merge authorization.

## Merge and bypass limits

- Auto-merge requires passing hosted CI on the exact head, local verification evidence, independent review with no unresolved findings, and the repository-required approving PR review.
- Bypass is scoped only to the six approved auto-merge tickets above, when protection alone blocks an otherwise eligible merge. GitHub can technically bypass the branch's review requirement, but CONTRIBUTING.md also requires an approving review; this approval does not waive it.
- Failed/missing checks, missing required review, sensitive changes awaiting owner review, unresolved findings, or an explicit no-bypass policy still block merge.
- No bypass applies to unrelated PRs, changed tickets needing reapproval, or quiet hours. Prefer rebase-and-merge per repository guidance. No force push to main or protection/settings mutation.
- A bypass must be recorded against the actual PR and head SHA with passing-gate evidence. It does not authorize deployment or release activation.

## Work and safety restrictions

Use clean isolated worktrees. Preserve unrelated current checkout edits and the unrelated active discoverable-public-profiles approval/run. Integrate current main and reassign additive migration numbers only then. Do not change deployed migration history.

No real credential use, Cloudflare/Firebase mutation, hosted workflow dispatch, staging/production deploy, live provider send, physical-device action or release activation is authorized here. Request separate owner approval for exact targets/operations. Missing external access is blocked, not a test pass.

Ticket/spec/plan changes invalidate this approval for affected entries and their meaning-changing dependents. Recheck GitHub ownership/state and reconcile any remote edits before implementation. Publish the local planning artifacts in a clean approved PR before relying on repository links in a fresh context.

## SHA-256 approved inputs

| File relative to this directory | SHA-256 |
| --- | --- |
| spec.md | ca7de09de12baf780e42f33e3b9287825f6be0c6bd45a1df11bd11fa47e8ef5f |
| plan.md | 2477a6ab65883601375f3e96e303a377b22fa43e0413fb66f605dcc4eecbce4d |
| tickets/MN-001.md | 328b5ed301e1772b0942377f7c34af5888f02612b61724cfe592ed9fcd531f2a |
| tickets/MN-002.md | d5cfc3563d7f99594f06f797bc3401da854af3f0a181a0eaa938ec8390e9b307 |
| tickets/MN-003.md | 3cbfc6f833ba70b160aab9f5d8b485b2e08dd0379c7e1ecdde2fd869e1a3cfd6 |
| tickets/MN-004.md | cc8744d5cd8fa80b56d9f1b4a6c767f96c5916ab3dd2daf8913bea0607c55be8 |
| tickets/GH-034.md | 5de9d4961bc404b6073b88980137221f05af9b4917c5bdd95820b2f29713257a |
| tickets/MN-005.md | 93cd818efacefcc927c18d3cf61c237d014d311adc761220a9ff7df1854ed720 |
