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
| [#128](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/issues/128) | Replies, reactions, editing, unsending and both client controls | #127, #27, #28, #32, #47. API and each client's controls can be separate commits/review checkpoints within the messaging stack PR. |
| [#129](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/issues/129) | Device registration and Worker FCM HTTP v1 delivery | #127, #26, #27, #31. Provider credentials gate real delivery, not local mocked development. |
| [#130](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/issues/130) | Flutter FCM/APNs lifecycle and notification navigation | #129, #32. Firebase/APNs ownership, signing, physical-device evidence gate release. |
| [#131](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/issues/131) | Cross-layer release verification, measured latency, rollout and operations | #128, #130, #29, #30, #31, #33, #47 |
| [#132](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/issues/132) | Deferred group messaging policy | Blocked on membership/history/blocking decisions; not a direct-text release dependency. |
| [#133](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/issues/133) | Deferred message attachments | Blocked on R2 upload owner and attachment-specific policy; not a text release dependency. |

## Three-PR stack

The approved merge order is: (1) backend refactor, (2) friends UI, then (3) messaging. Messaging is rebased on `feature/friends-ui`, not directly on refactor. Immutable media validation owns `0009_add_media_reservation_validation`, friends owns `0010_relationship_search`, and messaging owns `0011_messaging_foundation` and `0012_encrypt_push_device_tokens`. These migrations are undeployed feature work, so no deployed migration history was edited. Generated REST clients are regenerated from the merged Hono app. Approved rich web and mobile messaging flows are integrated. TanStack Query web adoption remains a separate reviewed branch. Local tests prove registration and dispatch authorization, not Firebase/APNs provider or physical-device delivery.

## Backend convention and documentation follow-up

The handoff now lives at `docs/implementation/messaging-implementation-handoff.md`. All 16 issue bodies were updated to use that path and reference `docs/backend-architecture.md` and the separate `docs/implementation/backend-refactor.md` plan. Messaging uses feature/action slices with action-prefixed filenames, typed session middleware, narrowly shared transaction helpers, and provider adapters in `apps/api/src/infrastructure/`. Existing-backend refactoring is separate work, not an implicit expansion of the messaging tickets.

## Scope and process notes

- Existing nine messaging issue bodies and titles were updated in place to preserve issue history, assignees, and discussion. Seven new issues fill missing work and explicit deferred follow-ups.
- Dependencies above are recorded in issue bodies, not asserted to be configured as native GitHub dependency relationships or project-board fields. No project-board status or assignee was changed.
- Existing issue-template text mentions old Firebase auth, GraphQL, and E2EE assumptions. Updated bodies retain the Description, Acceptance Criteria, High Risk, and Evidence structure but explicitly use current Better Auth/Hono/Postgres rules. Updating global templates is unrelated work.
- Unrelated friendship, media, export, and web feed issues were not modified. No external credentials, deployments, database migrations, or implementation code were changed.
- Publish the documentation branch or merge it before handing implementation to an agent without this working tree. Issue bodies currently name the repository-relative handoff path and branch because the document is not yet on the default branch.
