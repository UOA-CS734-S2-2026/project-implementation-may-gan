import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("../.github/workflows/staging-export-android.yml", import.meta.url), "utf8");
const release = readFileSync(new URL("../.github/workflows/staging-release.yml", import.meta.url), "utf8");
const api = readFileSync(new URL("../.github/workflows/staging-hyperdrive.yml", import.meta.url), "utf8");
const web = readFileSync(new URL("../.github/workflows/staging-web.yml", import.meta.url), "utf8");

test("staging release captures export modes once for both deployments", () => {
  assert.match(release, /export_approval: \$\{\{ steps\.release\.outputs\.export_approval \}\}/);
  assert.match(release, /export_cleanup_only: \$\{\{ steps\.release\.outputs\.export_cleanup_only \}\}/);
  for (const mode of ["export_approval", "export_cleanup_only"]) {
    assert.equal([...release.matchAll(new RegExp(`${mode}: \\$\\{\\{ needs\\.capture\\.outputs\\.${mode} \\}\\}`, "g"))].length, 2);
    assert.match(api, new RegExp(`inputs\\.${mode}`));
    assert.match(web, new RegExp(`inputs\\.${mode}`));
  }
  assert.doesNotMatch(api, /vars\.STAGING_EXPORT_ALL_USERS_APPROVED|CURRENT_EXPORT_APPROVAL/);
  assert.doesNotMatch(web, /vars\.STAGING_EXPORT_ALL_USERS_APPROVED|CURRENT_EXPORT_APPROVAL/);
  assert.doesNotMatch(web, /NEXT_PUBLIC_STAGING_EXPORT_APPROVED: \$\{\{ vars\./);
});

test("Android tester APK requires staging approval and exact staging API origin", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /environment: staging/);
  assert.match(workflow, /APPROVAL.*!= 'all-staging-accounts'/);
  assert.match(workflow, /API_ORIGIN.*!= 'https:\/\/api\.staging\.dayli\.agroupforcoders\.com'/);
  assert.match(workflow, /DAYLI_STAGING_EXPORT_APPROVED=true/);
  assert.match(workflow, /--dart-define=DAYLI_API_BASE_URL/);
  assert.match(workflow, /upload-artifact@v4/);
  assert.doesNotMatch(workflow, /pull_request|pull_request_target|secrets\./);
});
