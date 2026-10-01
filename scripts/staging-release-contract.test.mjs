import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "..");

function readWorkflow(name) {
  return readFileSync(resolve(repositoryRoot, ".github", "workflows", name), "utf8");
}

function requireMatch(source, pattern, message) {
  assert.match(source, pattern, message);
}

export function assertStagingReleaseContract({ release, api, web, migrations, cleanup }) {
  requireMatch(release, /workflow_run:\n {4}workflows: \[CI\]\n {4}branches: \[main\]\n {4}types: \[completed\]/, "staging release must run only after main CI");
  requireMatch(release, /workflow_dispatch:\n {4}inputs:\n {6}commit_sha:\n {8}description: Optional reviewed main commit SHA for a compatible rollback\n {8}required: false\n {8}type: string/, "manual dispatch must retain the reviewed rollback SHA input");
  requireMatch(release, /github\.event\.workflow_run\.head_branch == 'main'/, "workflow_run must require main as the source branch");
  requireMatch(release, /github\.event\.workflow_run\.head_repository\.full_name == github\.repository/, "workflow_run must reject fork sources");
  requireMatch(release, /environment: staging/, "release capture must require the protected staging environment");
  requireMatch(release, /ref: main\n {10}fetch-depth: 0/, "release capture must fetch main history");
  requireMatch(release, /sha="\$\{EVENT_SHA:-\$\{INPUT_SHA:-\$DISPATCH_SHA\}\}"/, "release must select the event, rollback, or dispatch SHA deterministically");
  requireMatch(release, /git cat-file -e "\$\{sha\}\^\{commit\}"/, "release must require an immutable commit SHA");
  requireMatch(release, /git merge-base --is-ancestor "\$sha" origin\/main/, "release must reject a commit outside main history");
  requireMatch(release, /STAGING_BROWSER_PROXY_ENABLED must be true or false/, "release must validate the captured proxy mode");
  requireMatch(release, /api:\n {4}needs: capture\n {4}uses: \.\/\.github\/workflows\/staging-hyperdrive\.yml[\s\S]*?commit_sha: \$\{\{ needs\.capture\.outputs\.commit_sha \}\}[\s\S]*?browser_proxy_enabled: \$\{\{ needs\.capture\.outputs\.browser_proxy_enabled \}\}[\s\S]*?secrets: inherit/, "API must use the captured release contract");
  requireMatch(release, /web:\n {4}needs: \[capture, api\]\n {4}uses: \.\/\.github\/workflows\/staging-web\.yml[\s\S]*?commit_sha: \$\{\{ needs\.capture\.outputs\.commit_sha \}\}[\s\S]*?browser_proxy_enabled: \$\{\{ needs\.capture\.outputs\.browser_proxy_enabled \}\}[\s\S]*?secrets: inherit/, "web must wait for API and use the captured release contract");
  requireMatch(release, /group: staging-release\n {2}cancel-in-progress: false/, "release concurrency must not cancel an active deployment");

  for (const [name, workflow] of [["API", api], ["web", web]]) {
    requireMatch(workflow, /on:\n {2}workflow_call:/, `${name} must be reusable only`);
    assert.doesNotMatch(workflow, /workflow_dispatch:|workflow_run:|pull_request:|\n {2}push:/, `${name} must not add an independent trigger`);
    requireMatch(workflow, /commit_sha:\n {8}required: true\n {8}type: string/, `${name} must require a commit SHA`);
    requireMatch(workflow, /browser_proxy_enabled:\n {8}required: true\n {8}type: string/, `${name} must require the captured proxy mode`);
    requireMatch(workflow, /environment: staging/, `${name} must require the protected staging environment`);
    requireMatch(workflow, /ref: \$\{\{ inputs\.commit_sha \}\}/, `${name} must check out the captured SHA`);
    requireMatch(workflow, /CAPTURED_BROWSER_PROXY_ENABLED: \$\{\{ inputs\.browser_proxy_enabled \}\}/, `${name} must use the captured proxy mode`);
    requireMatch(workflow, /CAPTURED_BROWSER_PROXY_ENABLED" != "\$STAGING_BROWSER_PROXY_ENABLED/, `${name} must reject a changed proxy mode`);
    requireMatch(workflow, new RegExp(`group: staging-${name.toLowerCase() === "api" ? "hyperdrive" : "web"}\\n  cancel-in-progress: false`), `${name} concurrency must not cancel an active deployment`);
  }

  requireMatch(migrations, /workflow_dispatch:/, "database migrations must remain manual");
  requireMatch(migrations, /migrate:\n {4}if: github\.ref == 'refs\/heads\/main'[\s\S]*?environment: \$\{\{ inputs\.target \}\}/, "database migrations must remain main-only and protected");
  requireMatch(cleanup, /cleanup:\n {4}[\s\S]*?if: github\.ref == 'refs\/heads\/main'\n {4}environment: staging/, "preview cleanup must remain main-only and protected");
  requireMatch(cleanup, /pull\.head\.repo\?\.full_name !== repository \|\|\n {14}pull\.head\.repo\?\.fork !== false/, "preview cleanup must reject fork PRs");
}

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
    api: current.api.replace("ref: ${{ inputs.commit_sha }}", "ref: main"),
  }), /API must check out the captured SHA/);

  assert.throws(() => assertStagingReleaseContract({
    ...current,
    web: current.web.replace('CAPTURED_BROWSER_PROXY_ENABLED" != "$STAGING_BROWSER_PROXY_ENABLED', 'CAPTURED_BROWSER_PROXY_ENABLED" != "false"'),
  }), /web must reject a changed proxy mode/);
});
