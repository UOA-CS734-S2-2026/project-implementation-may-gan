import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const workflowsDirectory = ".github/workflows";
const workflow = (name) => readFileSync(join(workflowsDirectory, name), "utf8");

test("ordinary CI checks draft legal-content parity without requiring approval", () => {
  const ci = workflow("ci.yml");

  assert.match(ci, /name: Check draft legal content parity\s+run: pnpm legal:check/);
  assert.doesNotMatch(ci, /pnpm legal:release:check/);
});

test("every web Worker publication requires the legal release gate before deployment", () => {
  for (const name of readdirSync(workflowsDirectory).filter((entry) => /\.ya?ml$/.test(entry))) {
    const contents = workflow(name);
    if (!/pnpm --dir apps\/web exec wrangler deploy/.test(contents)) continue;

    const releaseGate = contents.indexOf("pnpm legal:release:check");
    const deploy = contents.indexOf("pnpm --dir apps/web exec wrangler deploy");
    assert.notEqual(releaseGate, -1, `${name} deploys the web Worker without legal:release:check.`);
    assert.ok(releaseGate < deploy, `${name} checks legal approval after web deployment.`);
  }
});
