# Messaging admin merge approval amendment

## Latest user instruction

After requesting the E2E repair and separately authorizing scoped automatic staging operations, the user explicitly instructed: "merge them in admin bypass is to get past the github review that is what we agreed on earlier".

The coordinator treats this latest instruction as an amendment authorizing admin bypass of the GitHub approving-review requirement for the five discussed PRs: #267 planning publication, #269 notification foundation, #271 readiness tooling, #272 direct-message quota and #275 focused E2E/auth repair. It supersedes the earlier user approval's requirement to leave these PRs unmerged solely for missing approving GitHub reviews. It is not evidence that the user or a teammate personally performed a code review.

The user has been informed of the auth/session changes, secret/workflow boundary, regular index lock risk and migration0051 conflict. Owner-directed merge authorization covers these disclosed changes, subject to successful technical verification and clean independent review. No unresolved review finding or unreviewed meaning-changing scope may inherit this amendment.

## Gates that remain

- Passing hosted CI on the exact head to merge, including all four CI jobs.
- Local verification and applicable browser/PostgreSQL/contract tests on that head.
- Independent correctness review with no unresolved findings.
- Current main integration and approved ticket scope; the second schema PR must resolve its unmerged migration0051 collision before landing.
- Rebase-and-merge, exact expected head, no force push to main, no protection mutation and no unrelated PR merges.
- Inspect actual merge permissions and record bypassed review gate, reviewed head, CI evidence and merge result.

## Operations

The separate messaging-staging-operation-approval.md authorizes only existing automatic staging migration, allowlisted secret sync, API/web deployment and Hyperdrive proof triggered by these eligible merges. Preserve protected staging Environment and target-validation gates. Pending suffixes must be reviewed, not assumed authorized merely because they exist.

No production, Firebase/APNs provisioning, live OAuth readiness, notification sends, physical-device test, key rotation or manual workflow dispatch is authorized. Keep push activation and live acceptance gated separately. This amendment does not change any approved spec/plan/ticket digest or reopen completed history.
