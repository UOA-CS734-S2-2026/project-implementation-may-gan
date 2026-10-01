import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { createSafeReporter, runSmoke, SmokeFailure, STAGING_ORIGIN } from "../apps/web/scripts/staging-auth-smoke.mjs";
import { readStagingReleaseAttribution } from "./validate-staging-auth-attribution.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const workflow = readFileSync(resolve(repositoryRoot, ".github", "workflows", "staging-auth-smoke.yml"), "utf8");

function browserType({ closeError } = {}) {
  const context = {
    route: async () => {},
    newPage: async () => ({}),
    close: async () => { if (closeError) throw closeError; },
  };
  return {
    launch: async () => ({
      newContext: async () => context,
      close: async () => {},
    }),
  };
}

function outputFor(callback) {
  const lines = [];
  const reporter = createSafeReporter((line) => lines.push(line));
  return callback(reporter).then(() => lines.join("\n"));
}

test("safe reporting never emits credential-bearing browser errors", async () => {
  const email = "private-account@example.test";
  const password = "private-password";
  const cookie = "session=private-cookie";
  const output = await outputFor(async (reporter) => {
    const passed = await runSmoke({
      browserType: browserType(), reporter, email, password,
      journey: async () => { throw new Error(`login rejected for ${email} ${password} ${cookie}`); },
    });
    assert.equal(passed, false);
  });

  assert.match(output, /step=journey outcome=failed .*category=browser_failure/);
  for (const sensitive of [email, password, cookie]) assert.doesNotMatch(output, new RegExp(sensitive));
});

test("failed sign-in and sign-out categories never include secret-bearing error text", async () => {
  const secret = "private-password";
  for (const category of ["login_failed", "logout_failed"]) {
    const output = await outputFor(async (reporter) => {
      const passed = await runSmoke({
        browserType: browserType(), reporter, email: "private@example.test", password: secret,
        journey: async () => {
          const error = new SmokeFailure(category);
          error.message = `${category} ${secret}`;
          throw error;
        },
      });
      assert.equal(passed, false);
    });
    assert.match(output, new RegExp(`category=${category}`));
    assert.doesNotMatch(output, new RegExp(secret));
  }
});

test("unexpected redirects and cleanup failures have fixed non-sensitive categories", async () => {
  const secret = "private-password";
  const redirectOutput = await outputFor(async (reporter) => {
    const passed = await runSmoke({
      browserType: browserType(), reporter, email: "private@example.test", password: secret,
      journey: async ({ unexpectedHost }) => {
        unexpectedHost.value = true;
        throw new Error(`redirected with ${secret}`);
      },
    });
    assert.equal(passed, false);
  });
  assert.match(redirectOutput, /category=unexpected_host/);
  assert.doesNotMatch(redirectOutput, new RegExp(secret));

  const cleanupOutput = await outputFor(async (reporter) => {
    const passed = await runSmoke({
      browserType: browserType({ closeError: new Error(`cleanup ${secret}`) }), reporter, email: "private@example.test", password: secret,
      journey: async () => {},
    });
    assert.equal(passed, false);
  });
  assert.match(cleanupOutput, /step=cleanup outcome=failed .*category=cleanup_failed/);
  assert.doesNotMatch(cleanupOutput, new RegExp(secret));
});

test("release attribution accepts only the two captured immutable revisions", () => {
  const releaseSha = "a".repeat(40);
  const automationSha = "b".repeat(40);
  assert.deepEqual(readStagingReleaseAttribution(`release_sha=${releaseSha}\nautomation_sha=${automationSha}\n`), { releaseSha, automationSha });
  assert.throws(() => readStagingReleaseAttribution(`release_sha=${releaseSha}\nemail=private@example.test\n`));
});

test("workflow is fixed-target, trusted, serialized, and automatic runs are inactive by default", () => {
  assert.equal(STAGING_ORIGIN, "https://staging.dayli.agroupforcoders.com");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /cron: '17 \* \* \* \*'/);
  assert.match(workflow, /workflows: \[Deploy coordinated staging release\]/);
  assert.match(workflow, /github\.event\.workflow_run\.head_repository\.full_name == github\.repository/);
  assert.match(workflow, /github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(workflow, /github\.event\.workflow_run\.event == 'workflow_dispatch' \|\| github\.event\.workflow_run\.event == 'workflow_run'/);
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /vars\.STAGING_AUTH_SMOKE_AUTOMATION_ENABLED == 'true'/);
  assert.match(workflow, /group: staging-auth-smoke\n[ ]{2}cancel-in-progress: false/);
  assert.match(workflow, /timeout-minutes: 10/);
  assert.match(workflow, /environment: staging/);
  assert.match(workflow, /SMOKE_TEST_EMAIL: \$\{\{ secrets\.SMOKE_TEST_EMAIL \}\}/);
  assert.match(workflow, /SMOKE_TEST_PASSWORD: \$\{\{ secrets\.SMOKE_TEST_PASSWORD \}\}/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /staging-release-attribution/);
  assert.doesNotMatch(workflow, /inputs:\n|pull_request|pull_request_target|\n {2}push:/);
  assert.doesNotMatch(workflow, /upload-artifact|playwright-report|trace:|video:|screenshot:|har:/i);
});
