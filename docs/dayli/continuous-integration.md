# Continuous integration

`.github/workflows/ci.yml` automatically verifies every pull request, every push to `main`, and a manually dispatched run. It does not run ordinary feature-branch push builds, so an open pull request has one current verification set rather than duplicate runs. New commits cancel obsolete runs for the same pull request or `main` ref.

## Required checks

Configure `main` branch protection to require these exact checks:

- `CI / TypeScript`
- `CI / Contracts and Flutter`
- `CI / PostgreSQL integration`

Keep the existing pull request review requirement. Require the branch to be up to date before merging if the repository policy permits it. GitHub administrators must make this configuration change in repository settings, it is not encoded in this repository.

The checks have these gates:

| Check | Gates |
| --- | --- |
| `CI / TypeScript` | locked Node 24 and pnpm 10 install, lint, Next.js route type generation, recursive workspace type checking and tests, an API realtime test when `test:realtime` exists, then recursive build. |
| `CI / Contracts and Flutter` | locked Node 24 and pnpm 10 install, generated OpenAPI TypeScript and Dart client contract check, generated Dart client analysis and tests, then Flutter formatting, analysis, tests, and a debug APK build. Flutter is pinned to 3.47.2: the checked-in mobile lockfile requires Flutter 3.47 or later and this is the locally verified toolchain. JDK is Temurin 17. |
| `CI / PostgreSQL integration` | a fresh PostgreSQL 18 Docker Compose fixture, restricted `migrator` and `app` roles from the checked-in init SQL, an isolated relationship database, migration safety and drift checks, first application and idempotent reapplication, restricted-role database and API integration tests, and credential-error output checks. |

`pnpm test` is recursive, so tests introduced by the backend refactor, friends, or messaging work run once their packages declare their normal `test` scripts. The realtime step is deliberately conditional, so a later `@dayli/api` `test:realtime` script runs automatically without blocking this infrastructure branch before that work lands.

## Pull request boundary

The CI workflow uses only `contents: read`. It has no GitHub write permissions, protected environment access, deployment credentials, migration credentials, Neon connection strings, or private secrets. It uses `pull_request`, never `pull_request_target`, and runs untrusted fork code only in this read-only boundary. Do not add protected environments, deployment steps, or secrets to this workflow.

Each job has a timeout. GitHub-hosted standard Ubuntu runners run all jobs. No hosted result is implied until GitHub Actions has executed the workflow for a commit.

## Database fixture and future messaging coverage

`scripts/verify-postgres.sh` owns a uniquely named disposable Compose project and removes only that project's fixture volumes on exit. It does not reset or address the persistent `dayli-development` project or its local volume. `pnpm verify:local` calls the same script after its application and Flutter checks.

The reusable helper has the exact shell signature `provision_isolated_database <database_name>`. It creates only names matching `dayli_[a-z0-9_]+_test`, applies the restricted roles and schema grants, and is used for the relationship fixture. A future messaging integration suite can provision and migrate its own database with:

```bash
ADDITIONAL_ISOLATED_DATABASES=dayli_messaging_test bash scripts/verify-postgres.sh
```

When messaging database tests land, add that environment setting to the PostgreSQL CI job and pass `postgresql://migrator:migrator@localhost:5433/dayli_messaging_test` to the messaging test setup as `MESSAGING_TEST_DATABASE_URL`. The helper is additive and does not require the unmerged messaging schema or tests today.

## Deployment boundary

CI does not deploy, migrate Neon, or contact staging or production. `run-database-migrations.yml`, `database-migrations.yml`, `staging-hyperdrive.yml`, `staging-web.yml`, and `cleanup-hyperdrive-preview.yml` remain manual and protected according to their own main and environment guards. A reviewed manual staging or migration decision is separate from an automatic CI pass.
