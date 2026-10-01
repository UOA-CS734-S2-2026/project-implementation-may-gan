import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "..");

function readWorkflow(name) {
  return readFileSync(resolve(repositoryRoot, ".github", "workflows", name), "utf8");
}

function packageScripts() {
  return JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8")).scripts;
}

function requireMatch(source, pattern, message) {
  assert.match(source, pattern, message);
}

export function assertStagingReleaseContract({ release, api, web, migrations, cleanup }) {
  requireMatch(release, /workflow_run:\n {4}workflows: \[CI\]\n {4}branches: \[main\]\n {4}types: \[completed\]/, "staging release must run only after main CI");
  requireMatch(release, /workflow_dispatch:\n {4}inputs:\n {6}commit_sha:\n {8}description: Optional reviewed main commit SHA, staging schema must exactly match it\n {8}required: false\n {8}type: string/, "manual dispatch must retain the reviewed rollback SHA input and exact-schema condition");
  requireMatch(release, /github\.event\.workflow_run\.head_branch == 'main'/, "workflow_run must require main as the source branch");
  requireMatch(release, /github\.event\.workflow_run\.head_repository\.full_name == github\.repository/, "workflow_run must reject fork sources");
  requireMatch(release, /environment: staging/, "release capture must require the protected staging environment");
  requireMatch(release, /ref: main\n {10}fetch-depth: 0/, "release capture must fetch main history");
  requireMatch(release, /EVENT_SHA: \$\{\{ github\.event\.workflow_run\.head_sha \}\}[\s\S]*?INPUT_SHA: \$\{\{ inputs\.commit_sha \}\}[\s\S]*?DISPATCH_SHA: \$\{\{ github\.sha \}\}[\s\S]*?TOOLING_SHA: \$\{\{ github\.workflow_sha \}\}[\s\S]*?run: node scripts\/capture-staging-release\.mjs/, "release must capture event, rollback, dispatch, and immutable tooling SHAs through the release selector");
  requireMatch(release, /outputs:\n {6}commit_sha: \$\{\{ steps\.release\.outputs\.commit_sha \}\}\n {6}migration_mode: \$\{\{ steps\.release\.outputs\.migration_mode \}\}/, "release capture must expose its computed migration mode");
  requireMatch(release, /api:\n {4}needs: capture\n {4}uses: \.\/\.github\/workflows\/staging-hyperdrive\.yml[\s\S]*?commit_sha: \$\{\{ needs\.capture\.outputs\.commit_sha \}\}[\s\S]*?migration_mode: \$\{\{ needs\.capture\.outputs\.migration_mode \}\}[\s\S]*?browser_proxy_enabled: \$\{\{ needs\.capture\.outputs\.browser_proxy_enabled \}\}[\s\S]*?tooling_sha: \$\{\{ needs\.capture\.outputs\.tooling_sha \}\}[\s\S]*?secrets: inherit/, "API must use the captured release, migration mode, and tooling contract");
  requireMatch(release, /web:\n {4}needs: \[capture, api\]\n {4}uses: \.\/\.github\/workflows\/staging-web\.yml[\s\S]*?commit_sha: \$\{\{ needs\.capture\.outputs\.commit_sha \}\}[\s\S]*?browser_proxy_enabled: \$\{\{ needs\.capture\.outputs\.browser_proxy_enabled \}\}[\s\S]*?tooling_sha: \$\{\{ needs\.capture\.outputs\.tooling_sha \}\}[\s\S]*?secrets: inherit/, "web must wait for API and use the captured release and tooling contract");
  requireMatch(release, /group: staging-release\n {2}cancel-in-progress: false/, "release concurrency must not cancel an active deployment");

  for (const [name, workflow] of [["API", api], ["web", web]]) {
    requireMatch(workflow, /on:\n {2}workflow_call:/, `${name} must be reusable only`);
    assert.doesNotMatch(workflow, /workflow_dispatch:|workflow_run:|pull_request:|\n {2}push:/, `${name} must not add an independent trigger`);
    requireMatch(workflow, /commit_sha:\n {8}required: true\n {8}type: string/, `${name} must require a commit SHA`);
    if (name === "API") {
      requireMatch(workflow, /migration_mode:\n {8}required: true\n {8}type: string/, "API must require the captured migration mode");
    }
    requireMatch(workflow, /browser_proxy_enabled:\n {8}required: true\n {8}type: string/, `${name} must require the captured proxy mode`);
    requireMatch(workflow, /tooling_sha:\n {8}required: true\n {8}type: string/, `${name} must require an immutable tooling SHA`);
    requireMatch(workflow, /environment: staging/, `${name} must require the protected staging environment`);
    requireMatch(workflow, /ref: \$\{\{ inputs\.commit_sha \}\}/, `${name} must check out the captured SHA`);
    requireMatch(workflow, /CAPTURED_BROWSER_PROXY_ENABLED: \$\{\{ inputs\.browser_proxy_enabled \}\}/, `${name} must use the captured proxy mode`);
    requireMatch(workflow, /CAPTURED_BROWSER_PROXY_ENABLED" != "\$STAGING_BROWSER_PROXY_ENABLED/, `${name} must reject a changed proxy mode`);
    const concurrencyGroup = name === "API" ? "staging-database-state-staging" : "staging-web";
    requireMatch(workflow, new RegExp(`group: ${concurrencyGroup}\\n  cancel-in-progress: false`), `${name} concurrency must not cancel an active deployment`);
  }

  const targetGate = "Verify direct migrator target matches configured Hyperdrive";
  const targetGateIndex = api.indexOf(targetGate);
  assert.ok(targetGateIndex >= 0, "API must verify the direct migrator and Hyperdrive target match");
  requireMatch(api, /Check out immutable release tooling[\s\S]*?ref: \$\{\{ inputs\.tooling_sha \}\}[\s\S]*?path: deployment-tooling/, "API must check out immutable tooling separately from the captured application release");
  requireMatch(api, /Verify direct migrator target matches configured Hyperdrive\n {8}env:\n {10}CLOUDFLARE_ACCOUNT_ID: \$\{\{ vars\.CLOUDFLARE_ACCOUNT_ID \}\}\n {10}CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}\n {10}CLOUDFLARE_STAGING_HYPERDRIVE_ID: \$\{\{ secrets\.CLOUDFLARE_STAGING_HYPERDRIVE_ID \}\}\n {10}DATABASE_URL: \$\{\{ secrets\.DATABASE_URL \}\}\n {8}run: node deployment-tooling\/scripts\/verify-staging-schema-target\.mjs/, "target gate must use immutable tooling, the fixed Hyperdrive ID, and protected direct migrator secret");
  const migrationCheck = "Check captured release migrations before mutation";
  const migrationPlan = "Plan pending reviewed migrations";
  const messagingPreflight = "Preflight pending messaging readiness migration size";
  const migrationApply = "Apply pending reviewed migrations";
  const schemaGate = "Verify the captured release schema before deployment";
  const migrationCheckIndex = api.indexOf(migrationCheck);
  const migrationPlanIndex = api.indexOf(migrationPlan);
  const messagingPreflightIndex = api.indexOf(messagingPreflight);
  const migrationApplyIndex = api.indexOf(migrationApply);
  const schemaGateIndex = api.indexOf(schemaGate);
  assert.ok(migrationCheckIndex >= 0 && migrationPlanIndex >= 0 && messagingPreflightIndex >= 0 && migrationApplyIndex >= 0 && schemaGateIndex >= 0, "API must check, plan, preflight, conditionally apply, and verify captured migrations");
  requireMatch(api, /Check captured release migrations before mutation\n {8}if: inputs\.migration_mode == 'forward'[\s\S]*?MIGRATION_REPOSITORY_ROOT: \$\{\{ github\.workspace \}\}[\s\S]*?MIGRATIONS_DIR: \$\{\{ github\.workspace \}\}\/packages\/db\/migrations\n {8}run: pnpm --dir deployment-tooling db:check/, "trusted tooling must check the captured release before database access");
  requireMatch(api, /Plan pending reviewed migrations\n {8}id: migration_plan\n {8}if: inputs\.migration_mode == 'forward'[\s\S]*?run: pnpm --dir deployment-tooling db:plan/, "a forward release must plan pending migrations read-only");
  requireMatch(api, /Preflight pending messaging readiness migration size\n {8}if: inputs\.migration_mode == 'forward'[\s\S]*?MIGRATION_TARGET: staging[\s\S]*?DATABASE_URL: \$\{\{ secrets\.DATABASE_URL \}\}[\s\S]*?MIGRATIONS_DIR: \$\{\{ github\.workspace \}\}\/packages\/db\/migrations\n {8}run: node deployment-tooling\/scripts\/staging-messaging-0023-preflight\.mjs/, "a forward release must use immutable tooling to preflight pending 0023 table sizes");
  requireMatch(api, /Apply pending reviewed migrations\n {8}if: inputs\.migration_mode == 'forward' && steps\.migration_plan\.outputs\.pending == 'true'[\s\S]*?MIGRATIONS_DIR: \$\{\{ github\.workspace \}\}\/packages\/db\/migrations\n {8}run: pnpm --dir deployment-tooling db:migrate/, "only a forward release with pending reviewed migrations may apply them");
  requireMatch(api, /Verify the captured release schema before deployment\n {8}env:\n {10}MIGRATION_TARGET: staging\n {10}DATABASE_URL: \$\{\{ secrets\.DATABASE_URL \}\}\n {10}MIGRATIONS_DIR: \$\{\{ github\.workspace \}\}\/packages\/db\/migrations\n {8}run: pnpm --dir deployment-tooling db:verify/, "schema gate must use immutable tooling against captured release migrations and the protected direct migrator secret");
  assert.ok(api.indexOf("ref: ${{ inputs.commit_sha }}") < targetGateIndex, "target gate must run after the captured release checkout");
  assert.ok(targetGateIndex < migrationCheckIndex, "migration checks must run only after Hyperdrive target identity passes");
  assert.ok(migrationCheckIndex < migrationPlanIndex && migrationPlanIndex < messagingPreflightIndex && messagingPreflightIndex < migrationApplyIndex && migrationApplyIndex < schemaGateIndex, "forward migration order must be check, plan, preflight, apply, and exact verification");
  assert.ok(api.indexOf("Check out immutable release tooling") < targetGateIndex, "identity verification must use checked-out immutable tooling");
  for (const mutatingStep of [
    "Synchronize reviewed Worker secrets after configuration dry-runs",
    "Deploy the reviewed staging API Worker",
    "Run the Workers Hyperdrive check",
  ]) {
    assert.ok(schemaGateIndex < api.indexOf(mutatingStep), `schema gate must run before ${mutatingStep}`);
  }

  requireMatch(web, /Check out immutable release tooling[\s\S]*?ref: \$\{\{ inputs\.tooling_sha \}\}[\s\S]*?path: deployment-tooling/, "web must check out immutable tooling separately from the historical application release");

  requireMatch(migrations, /workflow_dispatch:/, "database migrations must remain manual");
  requireMatch(migrations, /group: staging-database-state-\$\{\{ inputs\.target \}\}\n[ ]{2}cancel-in-progress: false/, "staging migrations must share the API database-state lock");
  requireMatch(migrations, /migrate:\n {4}if: github\.ref == 'refs\/heads\/main'[\s\S]*?environment: \$\{\{ inputs\.target \}\}/, "database migrations must remain main-only and protected");
  requireMatch(migrations, /Plan staging migrations before mutation\n {8}id: staging_migration_plan\n {8}if: inputs\.target == 'staging'\n {8}run: pnpm db:plan/, "manual staging migrations must plan before mutation");
  requireMatch(migrations, /Preflight pending messaging readiness migration size\n {8}if: inputs\.target == 'staging'[\s\S]*?MIGRATIONS_DIR: \$\{\{ github\.workspace \}\}\/packages\/db\/migrations\n {8}run: node scripts\/staging-messaging-0023-preflight\.mjs/, "manual staging migrations must preflight 0023 sizes");
  requireMatch(migrations, /Apply migrations\n {8}id: apply\n {8}if: inputs\.target != 'staging' \|\| steps\.staging_migration_plan\.outputs\.pending == 'true'\n {8}run: pnpm db:migrate/, "manual staging apply must depend on the reviewed plan while production remains unchanged");
  requireMatch(cleanup, /cleanup:\n {4}[\s\S]*?if: github\.ref == 'refs\/heads\/main'\n {4}environment: staging/, "preview cleanup must remain main-only and protected");
  requireMatch(cleanup, /pull\.head\.repo\?\.full_name !== repository \|\|\n {14}pull\.head\.repo\?\.fork !== false/, "preview cleanup must reject fork PRs");
}

test("staging web enables invocation logging in source and verifies generated configuration", () => {
  const source = JSON.parse(readFileSync(resolve(repositoryRoot, "apps", "web", "wrangler.jsonc"), "utf8"));
  assert.deepEqual(source.observability, {
    enabled: true,
    logs: { enabled: true, invocation_logs: true },
  });

  const [sourceCheck, generatedCheck] = readWorkflow("staging-web.yml").split("Build vinext with the staging API origin");
  const expected = /config\.observability\?\.logs\?\.invocation_logs !== true/;
  assert.doesNotMatch(sourceCheck, expected, "historical source configuration must not block a rollback before the trusted overlay runs");
  assert.match(generatedCheck, /ensure-staging-web-observability\.mjs apps\/web\/dist\/server\/wrangler\.json/, "trusted tooling must add invocation logging to historical generated output");
  assert.match(generatedCheck, expected, "staging web must reject generated configuration without invocation logging");
});

function workflows() {
  return {
    release: readWorkflow("staging-release.yml"),
    api: readWorkflow("staging-hyperdrive.yml"),
    web: readWorkflow("staging-web.yml"),
    migrations: readWorkflow("run-database-migrations.yml"),
    cleanup: readWorkflow("cleanup-hyperdrive-preview.yml"),
  };
}

test("staging workflows retain their release and security contract", () => {
  assert.doesNotThrow(() => assertStagingReleaseContract(workflows()));
  assert.match(
    packageScripts()["test:staging-release-contract"],
    /scripts\/staging-messaging-0023-preflight\.test\.mjs/,
    "the staging release contract command must run the 0023 preflight tests",
  );
});

test("the contract rejects an untrusted source, changed release order, or uncaptured target", () => {
  const current = workflows();

  assert.throws(() => assertStagingReleaseContract({
    ...current,
    release: current.release.replace("github.event.workflow_run.head_repository.full_name == github.repository", "true"),
  }), /reject fork sources/);

  assert.throws(() => assertStagingReleaseContract({
    ...current,
    release: current.release.replace("needs: [capture, api]", "needs: capture"),
  }), /web must wait for API/);

  assert.throws(() => assertStagingReleaseContract({
    ...current,
    release: current.release.replace("run: node scripts/capture-staging-release.mjs", "run: true"),
  }), /release selector/);

  assert.throws(() => assertStagingReleaseContract({
    ...current,
    api: current.api.replace("ref: ${{ inputs.commit_sha }}", "ref: main"),
  }), /API must check out the captured SHA/);

  assert.throws(() => assertStagingReleaseContract({
    ...current,
    web: current.web.replace('CAPTURED_BROWSER_PROXY_ENABLED" != "$STAGING_BROWSER_PROXY_ENABLED', 'CAPTURED_BROWSER_PROXY_ENABLED" != "false"'),
  }), /web must reject a changed proxy mode/);

  assert.throws(() => assertStagingReleaseContract({
    ...current,
    api: current.api.replace("run: pnpm --dir deployment-tooling db:verify", "run: pnpm --dir deployment-tooling db:smoke"),
  }), /schema gate must use immutable tooling against captured release migrations/);

  assert.throws(() => assertStagingReleaseContract({
    ...current,
    api: current.api.replace("inputs.migration_mode == 'forward' && steps.migration_plan.outputs.pending == 'true'", "true"),
  }), /only a forward release with pending reviewed migrations may apply them/);

  assert.throws(() => assertStagingReleaseContract({
    ...current,
    api: current.api.replace("node deployment-tooling/scripts/staging-messaging-0023-preflight.mjs", "true"),
  }), /preflight pending 0023 table sizes/);

  assert.throws(() => assertStagingReleaseContract({
    ...current,
    api: current.api.replace("Preflight pending messaging readiness migration size\n        if: inputs.migration_mode == 'forward'", "Preflight pending messaging readiness migration size\n        if: true"),
  }), /preflight pending 0023 table sizes/);

  assert.throws(() => assertStagingReleaseContract({
    ...current,
    api: current.api.replace("Preflight pending messaging readiness migration size", "Apply pending reviewed migrations"),
  }), /check, plan, preflight, conditionally apply, and verify/);

  assert.throws(() => assertStagingReleaseContract({
    ...current,
    migrations: current.migrations.replace("node scripts/staging-messaging-0023-preflight.mjs", "true"),
  }), /manual staging migrations must preflight 0023 sizes/);

  assert.throws(() => assertStagingReleaseContract({
    ...current,
    api: current.api.replace("node deployment-tooling/scripts/verify-staging-schema-target.mjs", "true"),
  }), /target gate must use immutable tooling, the fixed Hyperdrive ID, and protected direct migrator secret/);

  assert.throws(() => assertStagingReleaseContract({
    ...current,
    api: current.api.replace("Synchronize reviewed Worker secrets after configuration dry-runs", "Verify the captured release schema before deployment"),
  }), /schema gate must run before Synchronize reviewed Worker secrets after configuration dry-runs/);
});
