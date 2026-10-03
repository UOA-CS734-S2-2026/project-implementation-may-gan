import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the complete web E2E run assigns every spec an isolated fixture", () => {
  const output = execFileSync("bash", [path.join(repoRoot, "scripts/test-web-e2e.sh")], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, DAYLI_WEB_E2E_PLAN_ONLY: "1" },
  });
  const plannedSpecs = output.trim().split("\n").map((line) => {
    const match = /^Running (e2e\/.+\.spec\.ts) in an isolated local fixture$/.exec(line);
    assert.ok(match, `unexpected E2E plan line: ${line}`);
    return match[1];
  });

  assert.deepEqual(plannedSpecs, [
    "e2e/auth-legal-links.spec.ts",
    "e2e/authenticated-home.spec.ts",
    "e2e/legal-pages.spec.ts",
    "e2e/messaging-polish.spec.ts",
    "e2e/messaging.spec.ts",
    "e2e/public-profiles.spec.ts",
  ]);
  assert.equal(new Set(plannedSpecs).size, plannedSpecs.length);
});
