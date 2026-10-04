# Proposed ticket refinement

Status: complete bodies and publication approved. GitHub revisions and new issues were published and exact body readback passed. See `tracker-map.md` for assigned numbers.

## Sources and access

Repository: `UOA-CS734-S2-2026/project-implementation-may-gan`.
GitHub full issue bodies/comments and open PR references were read. Authenticated permission is ADMIN. #34, #130, #131, #141 and #255 are open and unassigned. No listed open PR claims these issues. Unassigned does not prove that no one is working on them; recheck ownership before publishing and execution.

Closed #127 and completed messaging issues are history only. No reopening, edits or duplication are proposed.

## Templates

New implementation tickets use `.github/ISSUE_TEMPLATE/feature.yml`, including Description, Acceptance Criteria and High Risk. PR-001 uses `testing.yml`, including Test type, What needs to be tested and Test cases. Existing issue structures are retained. Additional AGaw fields are labeled. Obsolete template examples are explicitly distinguished from the current stack.

## Before and after

| Existing issue | Before | Proposed after | Affected dependency |
| --- | --- | --- | --- |
| #34 | Closing/unlock reminders plus undefined quiet hours in one issue | GH-034 owns final-hour scheduler/reminder. MN-005 owns midnight release. MN-QH-001 preserves quiet-hours scope, blocked on new product decisions. Original history remains. | MN-002 -> GH-034 -> MN-005 |
| #130 | Foreground suppression; generic conversation-only device evidence; blocked only by #141 | GH-130 requires foreground OS banners, approved previews, all four categories, account consent, safe taps and physical-device evidence. Client code belongs to MN-003. | GH-141, MN-003, MN-004, MN-005 -> GH-130 |
| #131 | Messaging/push evidence and target measurement | GH-131 preserves historical comments, consumes expanded GH-130 evidence and treats missing/over-two-second p95 as blocking. Quiet hours and quota remain non-blocking. | GH-130 -> GH-131 |
| #141 | External setup plus generic payload/provider readiness wording | PR-001 owns safe readiness tooling. GH-141 remains owner provisioning/configuration/OAuth-only validation, no send. | PR-001 -> GH-141 -> GH-130 |
| #255 | Broad persistent quota and configurable rollback | GH-255 specifies shared exact sliding count, fresh post-lock PostgreSQL time, index, config parsing, retry header/body, generated contracts and concurrency/boundary evidence. | Independent of notification/release chain |

Full proposed replacement bodies are `tickets/GH-034.md`, `../push-release-evidence/tickets/GH-{130,131,141}.md`, and `../direct-message-send-quota/tickets/GH-255.md`.

New issues are MN-001 through MN-005 at #259 through #263, PR-001 at #264, and blocked MN-QH-001 at #265. Stable local IDs remain unchanged. Assigned GitHub numbers were inserted into authoritative dependency links and verified by readback.

## Full affected graph

```text
MN-001 -> MN-002 -> MN-003
MN-001 ------------> MN-003
MN-002 -> MN-004
MN-002 -> GH-034 -> MN-005
PR-001 -> GH-141
GH-141, MN-003, MN-004, MN-005 -> GH-130 -> GH-131
shipped messaging foundation -> GH-255  [non-blocking for GH-131]
missing quiet-hours brief/spec -> MN-QH-001  [blocked, excluded from runs]
```

No cycles. External credentials do not block mock-tested implementation. Only live provisioning/readiness, physical tests and deployed acceptance depend on owner access/approval.

## Spec coverage

| Requirement | Owning ticket |
| --- | --- |
| Default-off account preference and device schema registration | MN-001, MN-003 |
| Separate durable notification events/deliveries and disabled expand rollout | MN-001 |
| Internal typed publishers, fenced dispatch, redaction, feature rollback | MN-002 |
| New messages, edited/current previews, unsend suppression, legacy cutover | MN-002 |
| Global consent gates both legacy and new delivery | MN-002, MN-003 |
| Foreground OS banner, four authorized routes, denial/session lifecycle | MN-003 |
| Friend request publisher and pending/block check | MN-004 |
| Auckland final-hour reminder, recovery/expiry/DST and bounded scheduler | GH-034 |
| Midnight eligible release event, date identity/expiry/visibility | MN-005 |
| Protected OAuth-only readiness tooling | PR-001 |
| Owner Firebase/APNs/secret configuration | GH-141 |
| Physical Android/iOS provider and lifecycle proof | GH-130 |
| Deployed messaging/recovery, p95 and operational release gates | GH-131 |
| Exact message quota, config, contracts/index/concurrency | GH-255 |
| Quiet hours | Explicitly excluded; preserved blocked MN-QH-001 |

## Approvals and restrictions

The user approved the slicing, #34 scope reconciliation, quiet-hours deferral, template selection, account consent clarification, complete bodies and GitHub publication. The user selected auto-merge for the eleven eligible tickets, automatic named-agent routing for scouts and implementors, latest origin/main, eight hours per invoked batch, hosted CI as a mandatory gate, and separate batch admin-bypass preauthorization under the revised skill.

No execution approval previously existed for these feature directories. Revised #34/#130/#131/#141/#255 did not inherit prior execution or merge permission; new approval is recorded in each feature's digest-pinned run-approval.md. Quiet-hours work has no parent spec/plan and is not eligible for execution approval. No run has started.

The unrelated discoverable-public-profiles run has active status in a separate directory. Its files, approvals, tickets and working tree changes are untouched. Publish/rebase coordination must not rewrite its inputs or another contributor's open PR scope.

No remote deployment, hosted workflow dispatch, credential use, provider send, physical test or production activation is authorized by ticket/PR merge choices. The revised skill's separate batch bypass decision is authorized only for the approved auto-merge tickets. It cannot override missing/failed hosted CI, local verification, independent review, the repository-required approving review, unresolved findings, sensitive-change owner review or an explicit no-bypass policy.
