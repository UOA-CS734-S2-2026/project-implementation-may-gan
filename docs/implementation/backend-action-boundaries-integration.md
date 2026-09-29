# Backend action boundaries, main integration record

## Integration

`origin/main` at `9a3662f` was merged into `refactor/backend-action-boundaries` with merge commit `e0a38fd`. The merge completed without conflicts. The merge commit has parents `c28c623` and `9a3662f`, so it retains the topic branch's messaging action ownership, CI workflow, nested test discovery, and API import checker, along with main's composer and authentication changes. No push, pull request update, or merge into `main` was performed.

## Contract baseline

A detached temporary worktree at `origin/main` was installed with `pnpm install --frozen-lockfile` and regenerated with `pnpm generate:clients`. The merged branch then passed `pnpm generate:clients:check`. The freshly generated OpenAPI document, TypeScript client, and Dart client were byte-for-byte identical between the two worktrees. Generation left no tracked changes.

## Passed checks

- `pnpm install --frozen-lockfile`
- `pnpm lint`, including `scripts/check-api-boundaries.mjs`
- `pnpm --filter @dayli/web exec next typegen`
- `pnpm typecheck`
- `pnpm test`: API 71 files and 285 tests passed, web 5 files and 23 tests passed, domain passed, and database unit tests passed. The default database test run skipped 13 integration tests because it was not configured with test database URLs.
- `pnpm --filter @dayli/api test:realtime`: 1 file and 1 test passed.
- Dart generated-client checks: `dart pub get`, `dart analyze`, and `dart test` passed.
- Flutter checks: `flutter pub get --enforce-lockfile`, `dart format --output=none --set-exit-if-changed .`, and `flutter analyze` passed. The composer deadline and send-lock test cases passed within the mobile test run.

## Environment-limited or failing checks

- The disposable PostgreSQL suite, `bash scripts/verify-postgres.sh`, was not run to completion. Docker was available, but port 5433 was already bound by the existing `db-postgres-1` container for this repository. The script creates and removes its own isolated container, so it was not allowed to stop or reuse that pre-existing container.
- `flutter test` failed two sign-up error-message widget tests: `explains a taken sign-up email instead of reporting an outage` and `explains rate-limited sign-up instead of reporting an outage`. The same failures reproduce in a clean detached worktree at `origin/main`. Both tests leave the now-required username empty, so sign-up validation prevents the mocked 422 or 429 response. This integration did not alter main's authentication behavior to mask that upstream failure.
- `pnpm build` failed locally in the web application because Turbopack could not resolve `zod/v4/core` from `@hookform/resolvers/zod`. This failure did not affect lint, typecheck, or tests, and no web source or lockfile differs from `origin/main` on this branch.
