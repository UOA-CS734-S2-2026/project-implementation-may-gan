import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { requiredObservability, updateGeneratedConfig } from "./ensure-staging-web-observability.mjs";

test("adds invocation logging to a historical generated Worker without changing its source configuration", () => {
  const directory = mkdtempSync(join(tmpdir(), "dayli-web-observability-"));
  const sourcePath = join(directory, "wrangler.jsonc");
  const generatedPath = join(directory, "wrangler.json");
  const historical = { name: "dayli-web-staging", workers_dev: false };

  try {
    writeFileSync(sourcePath, `${JSON.stringify(historical, null, 2)}\n`);
    writeFileSync(generatedPath, `${JSON.stringify(historical, null, 2)}\n`);

    updateGeneratedConfig(generatedPath);

    assert.deepEqual(JSON.parse(readFileSync(sourcePath, "utf8")), historical);
    assert.deepEqual(JSON.parse(readFileSync(generatedPath, "utf8")).observability, requiredObservability);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
