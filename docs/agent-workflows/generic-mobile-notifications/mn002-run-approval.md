# MN-002 implementation and merge approval

Status: invocation started after the staging Firebase mobile configuration task completed.
Started: 2026-10-04T05:28:32Z.
Fixed deadline: 2026-10-04T13:28:32Z. Retries do not extend it.
Preflight merged main: 545ed25ea8f591b0b42823bf1cf9d79fb7a12878.
Repository: UOA-CS734-S2-2026/project-implementation-may-gan.
Ticket: MN-002, GitHub #260 only.
Branch: 260/shared-notification-dispatch. Target: main.

## User decisions

The user instructed: "alright lets start on 260 afterward and do the whole review with merge cycle". The coordinator queued it after the currently running Firebase wiring task.

The user separately selected:

- "Authorize the same review-only admin bypass" for the new #260 PR, after being told the prior five-PR amendment did not cover it.
- "Authorize these automatic staging operations" for the existing pipeline triggered by this eligible merge, after the exact staging operations and exclusions were explained.

This is a fresh single-ticket invocation. It does not extend the expired original batch or the completed five-PR follow-up, and does not restart other tickets. Retain the existing eight-hour per-invocation cap, measured only from actual runner start. Record the start and fixed deadline before implementation. Retries do not extend it.

## Scope and routing

Implement the unchanged approved MN-002 scope in tickets/MN-002.md, spec.md and plan.md. The original automatic named-agent routing remains in force for this listed ticket: implementor-sol. Independent correctness review uses the named reviewer role. No new scout selection is made by this approval.

MN-001/#259 is merged in PR #269. Firebase mobile wiring is sequencing context, not permission to import its unmerged branch. Integrate latest merged origin/main at runner preflight. Preserve the original dirty checkout and all unrelated worktrees.

Scope includes transactional message notification intents for both creation endpoints, a leased shared dispatcher, current authorized previews, recipient/session/device/consent checks, legacy/new capability routing without duplicate delivery, bounded retries and repair, safe credential handling, and mocked provider tests. Keep notification publishing and delivery disabled by default. Do not widen messaging_outbox or change REST/realtime semantics. Preserve the quota locks, exact PostgreSQL boundaries and idempotency guarantees already merged.

Other publishers, Flutter consent/banner/tap implementation, quiet-hours #265, live device evidence and arbitrary send APIs remain excluded. Meaning-changing scope requires renewed approval.

## Technical merge gates

- Final committed head passes local verification and applicable real PostgreSQL, API, contract, client and browser tests.
- Fresh independent review has no unresolved findings.
- All required hosted CI jobs pass on that exact head. The old CONTRIBUTING.md statement that hosted CI is paused is not current operational evidence.
- Current-main integration and additive migration history are coherent, with deployed SQL, snapshots and review records preserved.
- Use expected-head rebase-and-merge. Admin bypass is limited to the GitHub approving-review requirement for this new #260 PR. No human review is fabricated, protection changed, main force-pushed or failed check bypassed.

## Automatic staging operations

After an eligible merge, the existing protected staging pipeline may apply reviewed pending migrations, synchronize existing allowlisted secrets, deploy the staging API/web targets and run Hyperdrive proof. Preserve existing protected Environment and target-validation gates. Inspect sanitized exact-release results without printing secrets.

This does not authorize adding Firebase credentials, changing the existing push-token encryption key, enabling publishers, live OAuth readiness, notification sends, Firebase/APNs provisioning, physical-device actions, production operations or manual workflow dispatch. Prepare tests using fake credentials and mocked provider calls only. OAuth or provider activation remains a separate owner gate.

## Approved inputs

| File | SHA-256 |
| --- | --- |
| spec.md | ca7de09de12baf780e42f33e3b9287825f6be0c6bd45a1df11bd11fa47e8ef5f |
| plan.md | 2477a6ab65883601375f3e96e303a377b22fa43e0413fb66f605dcc4eecbce4d |
| tickets/MN-002.md | d5cfc3563d7f99594f06f797bc3401da854af3f0a181a0eaa938ec8390e9b307 |

No approved input meaning or digest is changed. Earlier five-PR authorizations remain historical and are not silently extended to unrelated work.
