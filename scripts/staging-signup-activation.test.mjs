import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  assertActivationState,
  assertRollbackEligibility,
  publicationRows,
  readPublicationDocuments,
} from "./staging-signup-activation.mjs";
import { verifyStagingDeployedShas } from "./verify-staging-deployed-shas.mjs";

const sha = "a".repeat(40);
const accountId = "b".repeat(32);
const root = resolve(import.meta.dirname, "..");

function deployed(workerName, tag = sha, traffic = 100) {
  const versionId = `${workerName}-version`;
  return {
    deployments: [{ versions: [{ version_id: versionId, percentage: traffic }] }],
    versionId,
    version: { annotations: { "workers/tag": tag, "workers/message": `staging-release:${tag}` } },
  };
}

function requestFor(api, web) {
  return async (path) => {
    const source = path.includes("dayli-api-staging") ? api : web;
    return path.endsWith("/deployments") ? { deployments: source.deployments } : source.version;
  };
}

function document(id) {
  return { id, status: "approved", effectiveDate: "2026-10-04", version: "1" };
}

test("deployed SHA verification reads the active Cloudflare deployment, not a historical run", async () => {
  const api = deployed("dayli-api-staging");
  const web = deployed("dayli-web-staging");
  const verified = await verifyStagingDeployedShas({ accountId, apiToken: "not-logged", expectedSha: sha, request: requestFor(api, web) });
  assert.deepEqual(verified, {
    api: { workerName: "dayli-api-staging", versionId: api.versionId },
    web: { workerName: "dayli-web-staging", versionId: web.versionId },
  });
});

test("deployed SHA verification rejects a stale or partial current deployment", async () => {
  const staleApi = deployed("dayli-api-staging", "c".repeat(40));
  const web = deployed("dayli-web-staging");
  await assert.rejects(
    verifyStagingDeployedShas({ accountId, apiToken: "not-logged", expectedSha: sha, request: requestFor(staleApi, web) }),
    /not immutably attributed/,
  );
  const api = deployed("dayli-api-staging", sha, 50);
  await assert.rejects(
    verifyStagingDeployedShas({ accountId, apiToken: "not-logged", expectedSha: sha, request: requestFor(api, web) }),
    /100% traffic/,
  );
});

test("activation accepts only approved source and never infers an existing acceptance", async () => {
  assert.throws(() => readPublicationDocuments({ ...document("terms"), status: "draft" }, document("privacy")), /approved/);
  const rows = await publicationRows(document("terms"), document("privacy"));
  assert.equal(rows[0].id, "terms-v1");
  assert.deepEqual(
    assertActivationState({ rows, existingDocuments: [], existingAcceptanceCount: "0" }),
    { alreadyPublished: false, acceptanceCount: 0 },
  );
  assert.throws(
    () => assertActivationState({ rows, existingDocuments: [], existingAcceptanceCount: "1" }),
    /inherited acceptance/,
  );
  assert.throws(
    () => assertActivationState({
      rows,
      existingDocuments: [{ ...rows[0], content_digest: "f".repeat(64), status: "effective" }],
      existingAcceptanceCount: "0",
    }),
    /differs from the approved immutable document/,
  );
});

test("staging rollback preserves the effective gate and rejects an unexpected legal version", async () => {
  const rows = await publicationRows(document("terms"), document("privacy"));
  const active = rows.map((row) => ({
    id: row.id, kind: row.kind, version: row.version, content_digest: row.contentDigest,
    status: "effective", effective_at: row.effectiveAt,
  }));
  assert.doesNotThrow(() => assertRollbackEligibility({ rows, existingDocuments: active }));
  assert.throws(
    () => assertRollbackEligibility({
      rows,
      existingDocuments: [...active, { id: "old-terms", kind: "terms", version: 2, content_digest: "d".repeat(64), status: "effective" }],
    }),
    /unexpected effective legal document/,
  );
});

test("manual publisher is main-only, staging-only, and verifies both deployed Workers immediately before mutation", () => {
  const workflow = readFileSync(resolve(root, ".github/workflows/staging-signup-activation.yml"), "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /environment: staging/);
  assert.match(workflow, /group: staging-database-state-staging/);
  assert.match(workflow, /STAGING_SIGNUP_ACTIVATION_APPROVED/);
  assert.match(workflow, /ACTIVATE STAGING SIGNUP/);
  assert.match(workflow, /ROLLBACK STAGING SIGNUP/);
  assert.match(workflow, /git ls-remote origin refs\/heads\/main/);
  const verify = workflow.indexOf("Verify actual deployed API and web immutable revisions");
  const mutate = workflow.indexOf("Publish legal activation with existing-account acceptance checks");
  assert.ok(verify >= 0 && mutate > verify);
  assert.match(workflow.slice(verify, mutate), /verify-staging-deployed-shas\.mjs/);
  const finalRecheck = workflow.indexOf("Recheck current main and deployed Worker revisions immediately before mutation");
  assert.ok(finalRecheck > verify && mutate > finalRecheck);
  assert.match(workflow.slice(finalRecheck, mutate), /git ls-remote origin refs\/heads\/main/);
  assert.match(workflow.slice(finalRecheck, mutate), /verify-staging-deployed-shas\.mjs/);
  assert.match(workflow.slice(mutate), /STAGING_SIGNUP_ACTIVATION_TARGET: staging/);
  assert.doesNotMatch(workflow, /production/);

  const apiDeployment = readFileSync(resolve(root, ".github/workflows/staging-hyperdrive.yml"), "utf8");
  const webDeployment = readFileSync(resolve(root, ".github/workflows/staging-web.yml"), "utf8");
  for (const deployment of [apiDeployment, webDeployment]) {
    assert.match(deployment, /--tag "\$\{\{ inputs\.commit_sha \}\}" --message "staging-release:\$\{\{ inputs\.commit_sha \}\}"/);
  }
});
