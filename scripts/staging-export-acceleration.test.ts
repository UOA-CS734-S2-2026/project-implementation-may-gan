import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { matchesSyntheticOwner, validateSyntheticTarget } from "../packages/db/scripts/staging-export-accelerate";

const workflow = readFileSync(new URL("../.github/workflows/staging-export-accelerated-cleanup.yml", import.meta.url), "utf8");
const script = readFileSync(new URL("../packages/db/scripts/staging-export-accelerate.ts", import.meta.url), "utf8");
const ownerId = "staging-smoke-owner-123";
const requestId = "b61044a0-fd64-4c5c-88fa-136d37be9111";
const email = "synthetic@example.test";

test("only complete synthetic identity is accepted", () => {
  const target = validateSyntheticTarget({ ownerId, requestId, email });
  assert.deepEqual({ ownerId: target.ownerId, requestId: target.requestId, email: target.email },
    { ownerId, requestId, email });
  assert.match(target.prefix, /^private\/data-exports\/v2\/[0-9a-f]{64}\/$/);
  for (const input of [
    { ownerId: "", requestId, email },
    { ownerId, requestId: "other", email },
    { ownerId, requestId, email: "" },
  ]) assert.throws(() => validateSyntheticTarget(input));
  assert.equal(matchesSyntheticOwner({ id: ownerId, email: email.toUpperCase() }, { ownerId, email }), true);
  assert.equal(matchesSyntheticOwner({ id: "other-owner", email }, { ownerId, email }), false);
  assert.equal(matchesSyntheticOwner({ id: ownerId, email: "real@example.test" }, { ownerId, email }), false);
});

test("accelerated cleanup stays main-only, staging-only, manual, and synthetic-account scoped", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n {4}inputs:/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /environment: staging/);
  assert.match(workflow, /group: staging-database-state-staging/);
  assert.match(workflow, /Verify direct staging target against app Hyperdrive/);
  assert.match(workflow, /SMOKE_TEST_EMAIL: \$\{\{ secrets\.SMOKE_TEST_EMAIL \}\}/);
  assert.match(workflow, /STAGING_EXPORT_TEST_OWNER_ID: \$\{\{ vars\.STAGING_EXPORT_TEST_OWNER_ID \}\}/);
  assert.match(workflow, /STAGING_EXPORT_TEST_REQUEST_ID: \$\{\{ vars\.STAGING_EXPORT_TEST_REQUEST_ID \}\}/);
  assert.doesNotMatch(workflow, /pull_request|pull_request_target|\n {2}push:|\n {2}schedule:/);
  const expiry = script.indexOf("    await expire(sql, target);");
  const first = script.indexOf("    await awaitCronPass(() => firstPassComplete(sql, target));");
  const recheck = script.indexOf("    await recheck(sql, target);");
  const terminal = script.indexOf("    await awaitCronPass(() => terminalCleanupComplete(sql, target));");
  assert.ok(expiry > 0 && expiry < first && first < recheck && recheck < terminal);
  assert.doesNotMatch(workflow, /inputs\.phase|STAGING_EXPORT_ACCELERATION_PHASE/);
});
