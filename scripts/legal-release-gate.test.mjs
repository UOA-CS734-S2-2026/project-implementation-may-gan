import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { validateLegalDocument } from "../packages/legal-content/types.ts";

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

test("a draft cannot acquire an effective date in either validator", async () => {
  const terms = JSON.parse(await readFile("packages/legal-content/terms.json", "utf8"));
  const datedDraft = { ...terms, effectiveDate: "2026-10-02" };
  assert.throws(() => validateLegalDocument(datedDraft), /draft.*effective date/i);

  const root = await mkdtemp(join(tmpdir(), "dayli-legal-draft-"));
  try {
    await mkdir(join(root, "scripts"));
    await mkdir(join(root, "packages", "legal-content"), { recursive: true });
    await copyFile("scripts/sync-legal-content.mjs", join(root, "scripts", "sync-legal-content.mjs"));
    await writeFile(join(root, "packages", "legal-content", "privacy.json"), JSON.stringify(datedDraft));
    await writeFile(join(root, "packages", "legal-content", "terms.json"), JSON.stringify(datedDraft));
    assert.throws(
      () => execFileSync(process.execPath, [join(root, "scripts", "sync-legal-content.mjs"), "--release"], {
        cwd: root,
        encoding: "utf8",
        stdio: "pipe",
      }),
      (error) => {
        assert.match(`${error.stdout}${error.stderr}`, /draft.*effective date/i);
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
