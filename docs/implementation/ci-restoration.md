# CI restoration gate

`.github/workflows/ci.yml` remains manual-only. It has read-only token permissions and cancels stale runs for the same workflow and ref. It does not run deployment or database migration work.

The blocker is unresolved repository-owner and course or team approval for private-repository GitHub Actions spending. If publication is proposed, the owner must separately approve it after reviewing repository history, issues, workflow logs and artifacts, private data, and credentials. Changing visibility is not part of this branch.

After written approval confirms the budget, visibility decision, runner choice, and required branch checks, restore `pull_request` and selected `push` triggers for the existing TypeScript and Flutter jobs. Keep `workflow_dispatch`. Add emulator integration jobs only for manual or main-branch runs after a disposable synthetic-data API and Android emulator configuration are reviewed. Keep iOS simulator and physical-device checks as release work. Do not use `pull_request_target` to run untrusted code, expose deployment secrets to ordinary tests, or enable deployment and migration workflows through this change.
