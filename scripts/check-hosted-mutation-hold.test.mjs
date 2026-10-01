import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { assertAuthorizedCommit, assertAuthorizedManifest, checkAuthorization } from "./check-hosted-mutation-authorization.mjs";
import { auditHostedMutationWorkflows } from "./check-hosted-mutation-workflows.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim();

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "dayli-hosted-mutation-hold-"));
  cpSync(join(repositoryRoot, ".github"), join(root, ".github"), { recursive: true });
  writeFileSync(join(root, "package.json"), readFileSync(join(repositoryRoot, "package.json"), "utf8"));
  return root;
}

function withFixture(callback) {
  const root = fixtureRoot();
  try {
    callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function workflowPath(root, name) {
  return join(root, ".github", "workflows", name);
}

function replace(path, before, after) {
  const source = readFileSync(path, "utf8");
  assert.ok(source.includes(before), `fixture source did not contain ${before}`);
  writeFileSync(path, source.replace(before, after));
}

function replaceAll(path, before, after) {
  const source = readFileSync(path, "utf8");
  assert.ok(source.includes(before), `fixture source did not contain ${before}`);
  writeFileSync(path, source.replaceAll(before, after));
}

test("the checked-in workflow set is classified and held", () => {
  auditHostedMutationWorkflows(repositoryRoot);
});

test("missing, malformed, denied, and unknown manifests fail closed", () => {
  assert.throws(
    () => checkAuthorization({ expectedSha: sha, manifestPath: join(repositoryRoot, "missing.json"), cwd: repositoryRoot }),
    /manifest is missing/,
  );
  assert.throws(() => assertAuthorizedManifest("{", sha), /not valid JSON/);
  assert.throws(() => assertAuthorizedManifest('{"version":1,"state":"deny","commit":"ignored"}', sha), /unknown fields/);
  assert.throws(() => assertAuthorizedManifest('{"version":2,"state":"allow","commit":"0000000000000000000000000000000000000000"}', sha), /unknown schema/);
  assert.throws(() => assertAuthorizedManifest('{"version":1,"state":"deny"}', sha), /holds all hosted mutations/);
});

test("an explicit allow names one release commit", () => {
  assert.equal(
    assertAuthorizedManifest(`{"version":1,"state":"allow","commit":"${sha}"}`, sha),
    sha,
  );
  assert.doesNotThrow(() => assertAuthorizedCommit(sha, repositoryRoot));
  assert.throws(
    () => assertAuthorizedCommit("0000000000000000000000000000000000000000", repositoryRoot),
    /not in the live main history/,
  );
  assert.throws(
    () => assertAuthorizedManifest('{"version":1,"state":"allow","commit":"not-a-sha"}', sha),
    /unknown authorization state/,
  );
});

test("package aliases and alternate working directories remain mutation signals", () => withFixture((root) => {
  const aliasDirectory = join(root, "apps", "worker");
  mkdirSync(aliasDirectory, { recursive: true });
  writeFileSync(join(aliasDirectory, "package.json"), JSON.stringify({ name: "fixture-worker", scripts: { release: "wrangler deploy" } }));
  replace(
    workflowPath(root, "staging-web.yml"),
    "pnpm --dir apps/web exec wrangler deploy --config dist/server/wrangler.json",
    "pnpm --dir apps/worker release --config dist/server/wrangler.json",
  );
  auditHostedMutationWorkflows(root);

  replace(
    workflowPath(root, "staging-web.yml"),
    "        run: |\n          if [[ -z \"$CLOUDFLARE_API_TOKEN\" ]]; then",
    "        working-directory: apps/web\n        run: |\n          if [[ -z \"$CLOUDFLARE_API_TOKEN\" ]]; then",
  );
  replace(
    workflowPath(root, "staging-web.yml"),
    "pnpm --dir apps/worker release --config dist/server/wrangler.json",
    "pnpm exec wrangler deploy --config dist/server/wrangler.json",
  );
  auditHostedMutationWorkflows(root);
}));

test("secret synchronization and manual database migration remain held mutation paths", () => withFixture((root) => {
  const hyperdrive = workflowPath(root, "staging-hyperdrive.yml");
  replaceAll(hyperdrive, "wrangler deploy", "wrangler publish");
  replace(hyperdrive, "test:hyperdrive:staging", "test:hyperdrive:held-fixture");
  auditHostedMutationWorkflows(root);

  const migrations = readFileSync(workflowPath(root, "run-database-migrations.yml"), "utf8");
  assert.match(migrations, /workflow_dispatch:/);
  assert.match(migrations, /needs\.hosted-mutation-authorization\.outputs\.authorized == 'true'/);
}));

test("workflow_run trust checks reject fork paths and stale guard bypasses", () => withFixture((root) => {
  replaceAll(
    workflowPath(root, "staging-hyperdrive.yml"),
    "github.event.workflow_run.head_repository.full_name == github.repository",
    "true",
  );
  assert.throws(() => auditHostedMutationWorkflows(root), /reject workflow_run events from forks/);

  replace(
    workflowPath(root, "staging-web.yml"),
    "ref: refs/heads/main",
    "ref: ${{ github.sha }}",
  );
  assert.throws(() => auditHostedMutationWorkflows(root), /must fully check out the live main ref/);
}));

test("CI runs the hosted mutation hold test", () => withFixture((root) => {
  replace(
    workflowPath(root, "ci.yml"),
    "        run: pnpm test:hosted-mutation-hold",
    "        run: pnpm test",
  );
  assert.throws(() => auditHostedMutationWorkflows(root), /TypeScript job must run the hosted mutation hold test/);
}));

test("new workflows and jobs require an explicit classification", () => withFixture((root) => {
  writeFileSync(workflowPath(root, "unclassified.yml"), "name: unclassified\non: workflow_dispatch\njobs: {}\n");
  assert.throws(() => auditHostedMutationWorkflows(root), /Workflow files are not classified/);
}));
