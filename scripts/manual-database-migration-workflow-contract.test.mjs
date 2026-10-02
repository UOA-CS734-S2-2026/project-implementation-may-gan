import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "..");
const workflow = readFileSync(resolve(repositoryRoot, ".github", "workflows", "run-database-migrations.yml"), "utf8");

function requireMatch(pattern, message) {
  assert.match(workflow, pattern, message);
}

test("the hosted database migration workflow remains manual, immutable, and protected", () => {
  requireMatch(/^on:\n {2}workflow_dispatch:\n {4}inputs:\n {6}target:\n {8}description: Protected environment to migrate\n {8}required: true\n {8}type: choice\n {8}options: \[staging, production\]\n {6}production_backup_checked:\n {8}description: Type 'checked' after confirming a recent Neon restore point\/backup for production\n {8}required: false\n {8}type: string/m, "hosted migrations must retain the staging and production dispatch inputs");
  assert.doesNotMatch(workflow, /^ {2}(?:pull_request|push|merge_group|workflow_run):/m, "hosted migration commands must not run from PR or CI triggers");

  requireMatch(/migrate:\n {4}if: github\.ref == 'refs\/heads\/main'\n {4}runs-on: ubuntu-latest\n {4}environment: \$\{\{ inputs\.target \}\}/, "hosted migrations must remain main-only and environment protected");
  requireMatch(/MIGRATION_TARGET: \$\{\{ inputs\.target \}\}\n {6}MIGRATION_BASE_REF: \$\{\{ format\('\{0\}~1', github\.sha\) \}\}\n {6}DATABASE_URL: \$\{\{ secrets\.DATABASE_URL \}\}/, "the migration check must use the dispatched commit parent and protected database URL");
  assert.doesNotMatch(workflow, /MIGRATION_BASE_REF:\s*(?:HEAD|\$\{\{ github\.sha \}\})/, "the migration base must never be HEAD");

  requireMatch(/- uses: actions\/checkout@v4\n {8}with:\n {10}ref: \$\{\{ github\.sha \}\}\n {10}fetch-depth: 0/, "hosted migrations must check out the immutable dispatched SHA with full history");
  requireMatch(/CONFIRM_PRODUCTION_MIGRATION: \$\{\{ inputs\.target == 'production' && 'MIGRATE production' \|\| '' \}\}\n {6}CONFIRM_NEON_BACKUP_CHECKED: \$\{\{ inputs\.target == 'production' && inputs\.production_backup_checked == 'checked' && 'true' \|\| '' \}\}/, "production confirmation and backup requirements must remain intact");
  requireMatch(/production_messaging_0024_size_cap_bytes:\n {8}description: Optional reviewed 0024 five-table byte cap, production only, minimum 16777216\n {8}required: false\n {8}type: string/, "production must make any 0024 size-cap override explicit");
  requireMatch(/MESSAGING_0024_SIZE_CAP_BYTES: \$\{\{ inputs\.target == 'production' && inputs\.production_messaging_0024_size_cap_bytes \|\| '' \}\}/, "the explicit production-only 0024 cap must reach the migrator");
  requireMatch(/- name: Require staging success before production\n {8}if: inputs\.target == 'production'/, "production must require a prior staging migration");
  requireMatch(/- name: Write sanitized evidence[\s\S]*?name: database-migration-evidence-\$\{\{ inputs\.target \}\}-\$\{\{ github\.sha \}\}/, "hosted migrations must retain sanitized per-commit evidence");
});

test("the migration workflow audit rejects a shallow or mutable checkout", () => {
  assert.throws(() => {
    assert.match(workflow.replace("fetch-depth: 0", "fetch-depth: 1"), /fetch-depth: 0/);
  });
  assert.throws(() => {
    assert.match(workflow.replace("ref: ${{ github.sha }}", "ref: main"), /ref: \$\{\{ github\.sha \}\}/);
  });
});
