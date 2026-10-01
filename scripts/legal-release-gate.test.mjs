import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

test("draft legal content cannot pass the release gate", () => {
  assert.throws(
    () => execFileSync(process.execPath, ["scripts/sync-legal-content.mjs", "--release"], {
      encoding: "utf8",
      stdio: "pipe",
    }),
    (error) => {
      assert.equal(error.status, 1);
      assert.match(`${error.stdout}${error.stderr}`, /draft or has no approved effective date/i);
      return true;
    },
  );
});
