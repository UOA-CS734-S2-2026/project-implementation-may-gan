# Messaging ticket map

The [implementation handoff](messaging-implementation-handoff.md) is the technical source for these work items. GitHub issues were inspected and updated during this planning task. Changes are live on GitHub; documentation is on local branch `docs/messaging-architecture-handoff` until published. No implementation issue was marked complete. No issues were deleted or closed.

## Existing issues updated

| Issue | Piece | Depends on |
| --- | --- | --- |
| [#26](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/issues/26) | Direct conversations, messages, changes, read state, delivery schema, shared pair locks | #127 |
| [#27](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/issues/27) | Direct creation, message requests, transactional sending and retries | #127, #26 |
| [#28](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/issues/28) | Inbox, history, unread counts, receipts, durable change recovery | #127, #26, #27 |
| [#29](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/issues/29) | Session-bound ticket issue and atomic consumption | #127, #26 |
| [#30](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/issues/30) | Hibernating per-user Durable Objects and socket lifecycle | #29 |
| [#31](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/issues/31) | Immediate outbox dispatch and scheduled durable repair | #26, #27, #30 |
| [#32](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/issues/32) | Flutter inbox/thread/request screens and controller state | #27, #28 |
| [#33](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/issues/33) | Web and Flutter reconciliation, reconnects, lifecycle, no polling | #28, #30, #31, #32, #47 |
| [#47](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/issues/47) | Web messaging UI, TanStack Query, generated REST adapter | #27, #28 |

Issue #33 no longer requires a polling fallback and covers both clients. Issue #47 no longer asks an implementor to remove a legacy messaging backend that was not imported. #32 and #47 can complete their API-driven screen slices before #33; their combined live-delivery release acceptance is verified by #33, not a circular prerequisite.

## New issues created

| Issue | Piece | Depends on or gate |
| --- | --- | --- |
| [#127](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/issues/127) | Freeze contracts and proposed product defaults | First. Resolve defaults before dependent schema/behavior. |
| [#128](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/issues/128) | Replies, reactions, editing, unsending and both client controls | #127, #27, #28, #32, #47. API and each client's controls can be separate commits/review checkpoints within messaging PR 2. |
| [#129](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/issues/129) | Device registration and Worker FCM HTTP v1 delivery | #127, #26, #27, #31. Provider credentials gate real delivery, not local mocked development. |
| [#130](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/issues/130) | Flutter FCM/APNs lifecycle and notification navigation | #129, #32. Firebase/APNs ownership, signing, physical-device evidence gate release. |
| [#131](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/issues/131) | Cross-layer release verification, measured latency, rollout and operations | #128, #130, #29, #30, #31, #33, #47 |
| [#132](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/issues/132) | Deferred group messaging policy | Blocked on membership/history/blocking decisions; not a direct-text release dependency. |
| [#133](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/issues/133) | Deferred message attachments | Blocked on R2 upload owner and attachment-specific policy; not a text release dependency. |

## Two-PR execution

Use the [parallel-agent delivery plan](backend-refactor.md#two-pr-delivery-and-parallel-agent-plan). PR 1 contains the existing-backend refactor, test expansion/mobile test infrastructure, then approved Actions restoration. PR 2 contains messaging and all messaging-specific tests. The tickets above are work breakdowns inside PR 2, not a requirement for one PR per ticket. Development can proceed concurrently in isolated worktrees with agreed interfaces and file ownership; rebase messaging onto the reviewed foundation to form the stack and merge PR 1 first. No implementation orchestration starts before the user's explicit approval.

## Backend convention and documentation follow-up

The handoff now lives at `docs/implementation/messaging-implementation-handoff.md`. All 16 issue bodies were updated to use that path and reference `docs/backend-architecture.md` and the separate `docs/implementation/backend-refactor.md` plan. Messaging uses feature/action slices with action-prefixed filenames, typed session middleware, narrowly shared transaction helpers, and provider adapters in `apps/api/src/infrastructure/`. Existing-backend refactoring is separate work, not an implicit expansion of the messaging tickets.

## Scope and process notes

- Existing nine messaging issue bodies and titles were updated in place to preserve issue history, assignees, and discussion. Seven new issues fill missing work and explicit deferred follow-ups.
- Dependencies above are recorded in issue bodies, not asserted to be configured as native GitHub dependency relationships or project-board fields. No project-board status or assignee was changed.
- Existing issue-template text mentions old Firebase auth, GraphQL, and E2EE assumptions. Updated bodies retain the Description, Acceptance Criteria, High Risk, and Evidence structure but explicitly use current Better Auth/Hono/Postgres rules. Updating global templates is unrelated work.
- Unrelated friendship, media, export, and web feed issues were not modified. No external credentials, deployments, database migrations, or implementation code were changed.
- Publish the documentation branch or merge it before handing implementation to an agent without this working tree. Issue bodies currently name the repository-relative handoff path and branch because the document is not yet on the default branch.
