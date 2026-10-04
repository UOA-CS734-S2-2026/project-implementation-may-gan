# MN-003 implementation and merge approval

Status: invocation started after MN-002/#260 merged in PR #296.
Started: 2026-10-04T08:17:48Z.
Fixed deadline: 2026-10-04T16:17:48Z. Retries cannot extend it.
Preflight merged main: c1363064a211342845cd335c46d16fc69a2341e1.
Repository: UOA-CS734-S2-2026/project-implementation-may-gan.
Ticket: MN-003, GitHub #261 only.
Branch: 261/mobile-notification-consent. Target: main.

## User authorization

The user instructed: "alfter you merge 260 in start implementation on 261 withut me and continue the cycle remember to test at the end of implementation".

When asked whether #261 should use the same approved merge and automatic staging policy as #260, the user selected: "Yes, use the same policy and continue without asking again".

This authorizes the unchanged MN-003 implementation, independent review, coherent review-fix batches, final verification, PR publication, passing exact-head hosted CI, and eligible expected-head rebase-and-merge. Review-only admin bypass may satisfy the GitHub approving-review requirement. It may not bypass failed checks, mutate protections, fabricate human approval, or force-push main.

After the eligible merge, inspect the existing protected automatic staging pipeline. Its approved operations are reviewed migrations, existing allowlisted secret synchronization, staging API/web deployment and Hyperdrive proof, preserving protected Environment and exact-target validation gates.

This does not authorize #262 or other tickets, production setup, live OAuth readiness, real notification sends, credential installation, encryption-key access or rotation, Firebase/APNs provisioning, physical-device actions, manual workflow dispatch or publisher/delivery activation. Keep notification publishing and delivery disabled by default.

## Routing and dependency

The original approved named-agent route remains implementor-sol for MN-003. Use reviewer for independent correctness review. No scout role is newly authorized.

Start only after confirming #260 is actually merged. Preflight against current merged origin/main and verify the unchanged spec, plan and MN-003 digest pins below. Use this isolated worktree and preserve the original dirty checkout and other branches. Do not silently import unmerged changes.

The user separately selected "Include it in #261 as one mobile batch (Recommended)" when asked about the already-reviewed staging Firebase wiring. Import only that explicitly approved local change, originally a25b6884eeea723ab18128fa9fa25e45c53f2db8 and rebased as 86824c85c3790a11ec048f6e60e6188c8f7af221, from antga/staging-firebase-mobile-config. Keep staging/debug-only restrictions and disabled defaults. Reconcile current-main mobile and native configuration rather than overwriting newer changes. This avoids a separate Firebase PR and does not authorize server credentials, provisioning, activation or live sends. Preserve the existing Firebase worktree and branch.

## Batching and final gates

The user requested batching for this and subsequent tickets:

- Implement a coherent batch locally, then run focused regressions.
- Do not push small local commits or partial fixes.
- Resolve independent review findings in coherent batches before final complete verification.
- Independently inspect complete pinned verification evidence rather than rerunning full suites on an unchanged exact head without need.
- Final substantive source/base changes require appropriate final-head verification.
- Keep all required CI jobs, including Android builds, enabled. Publish the final locally verified, cleanly reviewed candidate and wait for exact-head hosted checks before merge.

Follow the approved platform compatibility spike and native build requirements. Simulator compilation does not prove signing, APNs setup, token registration or physical-device delivery. Missing tooling must be reported rather than counted as success. Full Xcode was found at /Applications/Xcode.app; xcodebuild -version succeeds with a per-command DEVELOPER_DIR despite the system default pointing to Command Line Tools. Do not change the system developer selection or provision Apple resources.

## Approved inputs

| File | SHA-256 |
| --- | --- |
| spec.md | ca7de09de12baf780e42f33e3b9287825f6be0c6bd45a1df11bd11fa47e8ef5f |
| plan.md | 2477a6ab65883601375f3e96e303a377b22fa43e0413fb66f605dcc4eecbce4d |
| tickets/MN-003.md | 3cbfc6f833ba70b160aab9f5d8b485b2e08dd0379c7e1ecdde2fd869e1a3cfd6 |

No approved input meaning or digest is changed. Prior invocation deadlines remain historical and are not extended by this approval.
