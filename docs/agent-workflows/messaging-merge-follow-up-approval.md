# Messaging merge follow-up

Started: 2026-10-04T01:15:17Z.
Deadline: 2026-10-04T09:15:17Z.

The user instructed: "continue implementing until we ca merge all the above" after the coordinator listed PRs #267, #269, #271, #272 and #275 as remaining. This is a fresh follow-up for those five PRs, not an extension of the expired original batch deadlines. The existing eight-hour invocation cap is retained. Retries do not extend this deadline.

## Scope

Integrate current merged main, repair conflicts and regressions within the five disclosed changes, publish refreshed exact heads, and merge eligible PRs. Preserve the original dirty checkout and unrelated contributors' work. Never import unmerged code or alter deployed migration history.

The existing named routing approvals remain unchanged for their tickets: implementor-sol for MN-001/#259 and GH-255/#255, implementor-terra for PR-001/#264, with the named reviewer role for independent correctness review. The user's separate implementor-sol selection remains in force for the E2E/auth repair #275. The coordinator owns the planning publication #267 and integration sequencing. Check the relevant run-approval.md and this follow-up before every delegation. No new scout work is authorized outside the original routing policy.

Merge requires local verification, passing hosted CI on the exact head, current-main integration and a clean independent review. The [admin merge amendment](messaging-admin-merge-approval.md) permits bypass only of the GitHub approving-review requirement for these five PRs. It does not waive failed checks or claim a human performed a review. Use expected-head rebase-and-merge, without force-pushing main or changing protection.

Existing automatic staging operations after eligible merges remain governed by [the staging operation approval](messaging-staging-operation-approval.md). Production, manual workflow dispatch, Firebase/APNs provisioning, real OAuth readiness, notification sends, physical-device acceptance and key rotation remain outside this follow-up.

## Not resumed

Downstream notification tickets #260/#261/#262/#34/#263 and live evidence tickets #141/#130/#131 are not restarted by this five-PR merge follow-up. Quiet-hours #265 remains excluded. Existing spec, plan and ticket digest pins remain unchanged.

## Integration order

Land #275 first so later branch CI uses the verified browser repair. Publish the planning and authorization artifacts through #267. Integrate #269/#271/#272 against the resulting main, merging them sequentially and refreshing the next branch as necessary. Main already owns migration 0051_post_likes_comments. Allocate later additive migration numbers only after integration, without modifying that deployed history.

Concurrent main changes can invalidate the migration-base gate. A failed check remains a blocker. Do not silently replace that policy or relax its ancestor requirement.
