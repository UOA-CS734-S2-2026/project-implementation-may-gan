# Combined notification publishers approval

Status: implementation started directly by the coordinator.
Started: 2026-10-04T09:45:51Z.
Fixed deadline: 2026-10-04T17:45:51Z. Retries do not extend it.
Preflight merged main: b2c7a82e3f574f6711ef0d8fa01e42746cf12db9.
Repository: UOA-CS734-S2-2026/project-implementation-may-gan.
Branch: 262/notification-publishers-batch. Target: main.
Scope: MN-004/#262, GH-034/#34 and MN-005/#263, with automated tests, in one PR.

## User decisions

The user requested: "merge this in and just do all three tickets in one pr and add testing too in that one pr as im running out of time". The three tickets refer to friend requests, the Auckland 23:00 unposted reminder, and midnight readable-friends-post release notifications.

The user then selected "Yes, complete the combined review and merge cycle automatically" for the same review-only admin and protected automatic staging policy as #261.

The latest instruction is: "begin implementation on the new work impleent yourself do not use a subagent". This overrides the prior implementor routing for this new batch. The coordinator implements directly and does not spawn implementation or reconnaissance subagents. Do not assume this instruction waives independent review. If a no-subagent restriction prevents an independent reviewer, resolve that gate explicitly before merge rather than fabricate review.

The user also instructed: "ignore local just wait for cloud ci i dont have 10 mins to spare". Do not repeat full local, native or browser suites before publication. Include meaningful automated tests in the implementation. Hosted exact-head CI is the final full verification gate, and no incomplete local run may be reported as passing. Focused checks may support development without starting repeated full-suite cycles.

## Execution and merge policy

Batch coherent changes and review fixes locally. Do not push every small commit or partial feature. Publish one completed combined candidate, not three ticket PRs. Preserve technical correctness, source review and all required hosted checks. Expected-head rebase-and-merge is authorized after eligible gates pass. Admin bypass is limited to the GitHub approving-review requirement, with no protection changes, fabricated human review, failed-check bypass or force-push of main.

MN-002/#260 is merged in PR #296. MN-003/#261 is the separate completed candidate in PR #300, awaiting cloud checks. Backend work may start now on merged main, as the latest user instruction requests. Integrate the actual merged #261/current main before final publication as needed. Do not silently import its unmerged code or unrelated branches.

The existing protected automatic staging pipeline may apply reviewed pending migrations, synchronize existing allowlisted secrets, deploy staging API/web and run Hyperdrive proof after an eligible merge. Preserve protected Environment and exact-target gates. Inspect sanitized exact-release results.

Keep notification publishing and delivery disabled by default. No other tickets, quiet hours, production setup, live OAuth readiness, real notification sends, Firebase/APNs provisioning, credential installation, encryption-key access or rotation, physical-device actions or manual workflow dispatch are authorized. Automated tests use fake providers and credentials. Device latency and live readiness remain separate owner gates.

Preserve the original dirty checkout, existing worktrees, deployed migration history, REST/realtime behaviour, messaging outbox semantics, quota locks and idempotency guarantees. New source intent and delivery work uses the shared notification storage and fenced dispatcher. Approved input meaning and original digest pins remain unchanged.

## Approved inputs

| File | SHA-256 |
| --- | --- |
| spec.md | ca7de09de12baf780e42f33e3b9287825f6be0c6bd45a1df11bd11fa47e8ef5f |
| plan.md | 2477a6ab65883601375f3e96e303a377b22fa43e0413fb66f605dcc4eecbce4d |
| tickets/MN-004.md | cc8744d5cd8fa80b56d9f1b4a6c767f96c5916ab3dd2daf8913bea0607c55be8 |
| tickets/GH-034.md | 5de9d4961bc404b6073b88980137221f05af9b4917c5bdd95820b2f29713257a |
| tickets/MN-005.md | 93cd818efacefcc927c18d3cf61c237d014d311adc761220a9ff7df1854ed720 |
