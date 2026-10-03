import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { fixturePlan, summarizeReports } from "./web-e2e-isolation.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function report(entries) {
  return {
    errors: [],
    suites: [{ specs: entries.map(({ file, project, status = "skipped" }) => ({
      file,
      tests: [{ projectName: project, status, results: status === "skipped" ? [] : [{ status }] }],
    })) }],
  };
}

test("the complete web E2E plan isolates every spec and browser project", () => {
  assert.deepEqual(fixturePlan(report([
    { file: "public-profiles.spec.ts", project: "mobile-chromium" },
    { file: "public-profiles.spec.ts", project: "desktop-chromium" },
    { file: "messaging.spec.ts", project: "mobile-chromium" },
    { file: "messaging.spec.ts", project: "desktop-chromium" },
  ])), [
    { file: "messaging.spec.ts", project: "desktop-chromium" },
    { file: "messaging.spec.ts", project: "mobile-chromium" },
    { file: "public-profiles.spec.ts", project: "desktop-chromium" },
    { file: "public-profiles.spec.ts", project: "mobile-chromium" },
  ]);
});

test("an empty discovery report cannot pass", () => {
  assert.throws(() => fixturePlan(report([])), /No web E2E spec and project pairs/);
});

test("aggregate results require an actual pass while retaining intentional skips", () => {
  assert.throws(
    () => summarizeReports([report([{ file: "polish.spec.ts", project: "desktop", status: "skipped" }])]),
    /did not execute any passing tests/,
  );
  assert.deepEqual(summarizeReports([
    report([{ file: "journey.spec.ts", project: "desktop", status: "passed" }]),
    report([{ file: "polish.spec.ts", project: "desktop", status: "skipped" }]),
  ]), { passed: 1, skipped: 1, failed: 0 });
});

test("aggregate results reject any failed fixture", () => {
  assert.throws(
    () => summarizeReports([report([{ file: "journey.spec.ts", project: "desktop", status: "failed" }])]),
    /contain 1 non-passing test/,
  );
});

test("the isolation contract is wired into local and hosted verification", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  assert.equal(packageJson.scripts["test:web-e2e-contract"], "node --test scripts/test-web-e2e.test.mjs");
  assert.match(fs.readFileSync(path.join(repoRoot, "scripts/verify-local.sh"), "utf8"), /pnpm test:web-e2e-contract/);
  assert.match(fs.readFileSync(path.join(repoRoot, ".github/workflows/ci.yml"), "utf8"), /pnpm test:web-e2e-contract/);
  assert.doesNotMatch(fs.readFileSync(path.join(repoRoot, "scripts/test-web-e2e.sh"), "utf8"), /PLAN_ONLY/);
});
