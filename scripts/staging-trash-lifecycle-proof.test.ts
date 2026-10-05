import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  classifyProofFailure,
  createProtocolDiagnostic,
  discoverExpectedMigrationLedger,
  requestProofJson,
  requestProofRecord,
  requireProofNonEmptyString,
  requireProofRecordValue,
  validateMarker,
  validateProofTarget,
} from "../packages/db/scripts/staging-trash-lifecycle-proof";
import { createStagingTrashProofProbe } from "./create-staging-trash-proof-probe.mjs";
import { createStagingWorkerConfigs } from "./staging-worker-config.mjs";
import { verifyStagingTrashProofStorage } from "./verify-staging-trash-proof-storage.mjs";
import { verifyStagingTrashProofTarget } from "./verify-staging-trash-proof-target.mjs";

const workflow = readFileSync(new URL("../.github/workflows/staging-trash-lifecycle-proof.yml", import.meta.url), "utf8");
const proof = readFileSync(new URL("../packages/db/scripts/staging-trash-lifecycle-proof.ts", import.meta.url), "utf8");
const entrypoint = readFileSync(new URL("../apps/api/src/features/system/hyperdrive/integration-entrypoint.ts", import.meta.url), "utf8");
const apiIndex = readFileSync(new URL("../apps/api/src/index.ts", import.meta.url), "utf8");
const probeModule = readFileSync(new URL("../apps/api/src/features/system/hyperdrive/test-worker.ts", import.meta.url), "utf8");
const stagingTest = readFileSync(new URL("../apps/api/test/__tests__/staging-trash-proof.staging.test.ts", import.meta.url), "utf8");
const sha = "a".repeat(40);

test("accepts only one exact target, current main, and deployed revision", () => {
  assert.equal(validateProofTarget({ targetSha: sha, checkedOutSha: sha, mainSha: sha, deployedSha: sha }), sha);
  for (const changed of ["main", "b".repeat(40)]) {
    assert.throws(() => validateProofTarget({ targetSha: sha, checkedOutSha: sha, mainSha: changed, deployedSha: sha }));
  }
  assert.match(workflow, /target_sha:[\s\S]*required: true/);
  assert.match(workflow, /git ls-remote origin refs\/heads\/main/);
  assert.match(workflow, /DEPLOYED_SHA: \$\{\{ inputs\.target_sha \}\}/);
});

test("workflow is protected, manual, staging-only, locked, and has no deployment trigger", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment: staging/);
  assert.match(workflow, /group: staging-database-state-staging/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.doesNotMatch(workflow, /pull_request|pull_request_target|\n {2}push:|\n {2}schedule:|workflow_run:/);
  assert.doesNotMatch(workflow, /wrangler deploy|staging-release\.yml|repository_dispatch/);
});

test("preflights the restricted same-database worker and private deployed revision before fixture writes", () => {
  const target = workflow.indexOf("Require exact current main target");
  const metadata = workflow.indexOf("Verify restricted uncached lifecycle worker target");
  const attestation = workflow.indexOf("Attest deployed revision and aggregate role fence");
  const fixture = workflow.indexOf("Run accelerated synthetic proof");
  assert.ok(target > 0 && target < metadata && metadata < attestation && attestation < fixture);
  assert.match(workflow, /verify-staging-trash-proof-target\.mjs/);
  assert.match(workflow, /verify-staging-export-worker-target\.mjs/);
  assert.match(workflow, /verify-staging-trash-proof-storage\.mjs/);
  assert.match(workflow, /R2_ACCESS_KEY_ID: \$\{\{ secrets\.R2_ACCESS_KEY_ID \}\}/);
  assert.match(workflow, /R2_SECRET_ACCESS_KEY: \$\{\{ secrets\.R2_SECRET_ACCESS_KEY \}\}/);
  assert.match(workflow, /vitest\.staging-trash-proof\.config\.ts/);
  assert.match(entrypoint, /proveStagingRevision/);
  assert.match(entrypoint, /provePostTrashWorkerFence/);
  assert.match(apiIndex, /export \{ HyperdriveIntegrationEntrypoint \}/);
  assert.match(probeModule, /export \{ HyperdriveIntegrationEntrypoint \}/);
  assert.match(stagingTest, /awaitRpcDeployment/);
  assert.match(entrypoint, /appRole\?\.currentUser !== "app"/);
  assert.match(entrypoint, /appRole\.canReport !== false/);
  assert.match(entrypoint, /workerRole\?\.currentUser !== "lifecycle_worker"/);
  assert.match(entrypoint, /workerRole\.canReport !== true/);
  assert.doesNotMatch(entrypoint, /catch \{\s*appRoleDenied = true/);
});

test("API target preflight accepts only the reviewed host mapped to the staging service", async () => {
  const environment = {
    CLOUDFLARE_ACCOUNT_ID: "a".repeat(32), CLOUDFLARE_API_TOKEN: "secret",
    STAGING_API_SERVICE_NAME: "dayli-api-staging", STAGING_AUTH_SITE_HOST: "staging.example.test",
    STAGING_AUTH_API_ORIGIN: "https://api.staging.example.test",
    STAGING_AUTH_WEB_ORIGIN: "https://web.staging.example.test",
  };
  const response = (service: string, hostname = "api.staging.example.test") => async () => new Response(JSON.stringify({
    success: true, result: [{ hostname, service, environment: "production" }],
  }), { status: 200, headers: { "content-type": "application/json" } });
  await assert.doesNotReject(() => verifyStagingTrashProofTarget({ environment, fetchImpl: response("dayli-api-staging") }));
  await assert.rejects(() => verifyStagingTrashProofTarget({ environment, fetchImpl: response("production-api") }));
  await assert.rejects(() => verifyStagingTrashProofTarget({ environment: {
    ...environment, STAGING_AUTH_API_ORIGIN: "https://production.example.test",
  }, fetchImpl: response("dayli-api-staging", "production.example.test") }));
});

test("storage metadata preflight fails before any provider request when configuration is incomplete", async () => {
  await assert.rejects(() => verifyStagingTrashProofStorage({
    CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
    STAGING_R2_BUCKET_NAME: "staging-media",
    R2_ACCESS_KEY_ID: "present",
  }));
});

test("discovers the exact migration ledger from repository and package working directories without a database", async () => {
  const original = process.cwd();
  try {
    process.chdir(fileURLToPath(new URL("..", import.meta.url)));
    const fromRepository = await discoverExpectedMigrationLedger();
    process.chdir(fileURLToPath(new URL("../packages/db", import.meta.url)));
    const fromPackage = await discoverExpectedMigrationLedger();
    assert.deepEqual(fromPackage, fromRepository);
    assert.equal(fromPackage.some((entry) => entry.idx === 30), true);
    assert.equal(fromPackage.some((entry) => entry.idx === 34), true);
    assert.equal(fromPackage.every((entry) => /^[a-f0-9]{64}$/.test(entry.hash)), true);
  } finally {
    process.chdir(original);
  }
});

test("records only fixed operation, numeric status, and guard categories for protocol failures", async () => {
  const diagnostic = createProtocolDiagnostic();
  const accepted = await requestProofJson<{ status: string }>(diagnostic, "legal_current", "https://api.example.test",
    "/api/v1/legal/current", {}, 200, async (input) => {
      assert.equal(input, "https://api.example.test/api/v1/legal/current");
      return Response.json({ status: "effective" });
    });
  assert.deepEqual(accepted.body, { status: "effective" });
  assert.deepEqual(diagnostic, { operation: "legal_current", httpStatus: 200, guardType: null });

  await assert.rejects(requestProofJson(diagnostic, "media_complete", "https://api.example.test", "/complete", {}, 200,
    async () => Response.json({ private: "not-recorded" }, { status: 409 })));
  assert.deepEqual(diagnostic, { operation: "media_complete", httpStatus: 409, guardType: "unexpected_http_status" });

  await assert.rejects(requestProofJson(diagnostic, "post_create", "https://api.example.test", "/posts", {}, 201,
    async () => new Response("not-json", { status: 201 })));
  assert.deepEqual(diagnostic, { operation: "post_create", httpStatus: 201, guardType: "invalid_json" });

  await assert.rejects(requestProofJson(diagnostic, "media_upload", "https://api.example.test", "/upload", {}, 200,
    async () => { throw new Error("credential-like-private-detail"); }));
  assert.deepEqual(diagnostic, { operation: "media_upload", httpStatus: null, guardType: "transport_failure" });
  assert.doesNotMatch(JSON.stringify(diagnostic), /private|credential|detail/);
});

test("classifies valid JSON non-record response shapes without dereferencing them", async () => {
  for (const body of [null, [], "text", true, 7]) {
    const diagnostic = createProtocolDiagnostic();
    await assert.rejects(requestProofRecord(diagnostic, "legal_current", "https://api.example.test", "/legal", {}, 200,
      async () => Response.json(body)));
    assert.deepEqual(diagnostic, { operation: "legal_current", httpStatus: 200, guardType: "invalid_response_contract" });
  }

  for (const [operation, nested] of [
    ["media_reserve", null],
    ["posting_day", []],
    ["post_create", "not-media"],
    ["trash_list", 4],
  ] as const) {
    const diagnostic = { operation, httpStatus: 200, guardType: null };
    assert.throws(() => requireProofRecordValue(diagnostic, nested));
    assert.deepEqual(diagnostic, { operation, httpStatus: 200, guardType: "invalid_response_contract" });
  }
});

test("preserves non-empty guards for required protocol identifiers and dates", () => {
  for (const operation of ["media_reserve", "posting_day", "post_create"] as const) {
    const diagnostic = { operation, httpStatus: 200, guardType: null };
    assert.throws(() => requireProofNonEmptyString(diagnostic, ""));
    assert.deepEqual(diagnostic, { operation, httpStatus: 200, guardType: "invalid_response_contract" });
  }

  const diagnostic = { operation: "post_create" as const, httpStatus: 201, guardType: null };
  assert.equal(requireProofNonEmptyString(diagnostic, "non-empty-id"), "non-empty-id");
  assert.deepEqual(diagnostic, { operation: "post_create", httpStatus: 201, guardType: null });
});

test("maps proof phases to sanitized failure categories", () => {
  assert.equal(classifyProofFailure("configuration"), "configuration_failure");
  assert.equal(classifyProofFailure("migration_ledger"), "migration_ledger_failure");
  assert.equal(classifyProofFailure("restore_fixture"), "normal_api_failure");
  assert.equal(classifyProofFailure("purge_fixture"), "normal_api_failure");
  assert.equal(classifyProofFailure("guarded_seed"), "guard_failure");
  assert.equal(classifyProofFailure("scheduled_cleanup"), "scheduled_cleanup_failure");
  assert.equal(classifyProofFailure("complete"), "normal_api_failure");
  assert.match(proof, /failureCategory: ProofFailureCategory \| null/);
  assert.doesNotMatch(proof, /failureCategory\s*=\s*error|error\.message|error\.stack/);
});

test("guarded acceleration is parameterized, exact-row scoped, and bounded", () => {
  assert.equal(validateMarker("staging-trash-proof-" + "f".repeat(32)), "staging-trash-proof-" + "f".repeat(32));
  assert.throws(() => validateMarker("existing-content"));
  assert.match(proof, /for update of owner/);
  assert.match(proof, /for update of reservation, media/);
  assert.match(proof, /set local lock_timeout = '5s'/);
  assert.match(proof, /set local statement_timeout = '15s'/);
  assert.match(proof, /updated\.count !== 1/);
  assert.match(proof, /trash_generation = \$\{input\.generation\}/);
  assert.match(proof, /object_key !== expectedKey/);
  assert.match(proof, /post_refs !== "0"/);
  assert.match(proof, /avatar_refs !== "0"/);
  assert.match(proof, /Date\.now\(\) \+ 9 \* 60_000/);
  assert.match(proof, /did not complete before the deadline/);
});

test("proof uses normal API media lifecycle and never invokes cleanup or object removal", () => {
  for (const path of [
    "/api/v1/media-reservations", "/complete", "/api/v1/posts", "/trash", "/api/v1/posts/trash", "/restore",
  ]) assert.ok(proof.includes(path), path);
  assert.doesNotMatch(proof, /claim_post_trash_cleanup|complete_post_trash_cleanup|reschedule_post_trash_cleanup/);
  assert.doesNotMatch(proof, /\bdelete\s+from\b|method:\s*["']DELETE["']|\.delete\s*\(/i);
  assert.match(proof, /method: "HEAD"/);
  assert.match(proof, /storage_presence_mismatch/);
  assert.ok(proof.indexOf("objectIsAbsent(fixture.objectKey, diagnostic") < proof.indexOf("async function trashFixture"));
  assert.match(proof, /response\.status === 404/);
});

test("logs and evidence remain sanitized and failures preserve exact fixtures", () => {
  assert.doesNotMatch(proof, /console\.(log|error)\([^\n]*(token|email|objectKey|ownerId|postId|reservationId|databaseUrl)/i);
  assert.match(proof, /outcome=incomplete fixtures=preserved evidence=sanitized/);
  assert.match(proof, /markerDigest/);
  assert.match(proof, /phase: ProofPhase/);
  assert.match(proof, /failureCategory: ProofFailureCategory \| null/);
  assert.match(proof, /protocol: ProtocolDiagnostic/);
  assert.doesNotMatch(proof, /JSON\.stringify\(evidence[^\n]*(owner|post|reservation|email|token|object)/i);
  assert.match(workflow, /if: always\(\)/);
});

test("release and manual proof consumers receive identical strict attestation expectations", () => {
  const storageAccountId = "b".repeat(32);
  const storageBucketName = "staging-media";
  const manual = createStagingTrashProofProbe({ targetSha: sha, serviceName: "dayli-api-staging",
    storageAccountId, storageBucketName });
  const { probe: release } = createStagingWorkerConfigs({
    workerName: "dayli-api-staging", hyperdriveId: "c".repeat(32), releaseSha: sha,
    authApiOrigin: "https://api.staging.example.test", authWebOrigin: "https://web.staging.example.test",
    mediaVars: { R2_ACCOUNT_ID: storageAccountId, R2_BUCKET_NAME: storageBucketName },
  });
  assert.deepEqual(release.vars, manual.vars);
  assert.deepEqual(release.vars, {
    EXPECTED_STAGING_RELEASE_SHA: sha,
    EXPECTED_STAGING_STORAGE_DIGEST: manual.vars.EXPECTED_STAGING_STORAGE_DIGEST,
  });
});

test("private probe has no public route, cron, database binding, or mutable mode", () => {
  const storageAccountId = "b".repeat(32);
  const storageBucketName = "staging-media";
  const config = createStagingTrashProofProbe({ targetSha: sha, serviceName: "dayli-api-staging",
    storageAccountId, storageBucketName });
  assert.equal(config.workers_dev, false);
  assert.equal(config.vars.EXPECTED_STAGING_RELEASE_SHA, sha);
  assert.match(config.vars.EXPECTED_STAGING_STORAGE_DIGEST, /^[a-f0-9]{64}$/);
  const untrusted = config as unknown as Record<string, unknown>;
  assert.equal(untrusted.routes, undefined);
  assert.equal(untrusted.triggers, undefined);
  assert.equal(untrusted.hyperdrive, undefined);
  assert.equal(config.services[0]?.entrypoint, "HyperdriveIntegrationEntrypoint");
  assert.throws(() => createStagingTrashProofProbe({ targetSha: "main", serviceName: "dayli-api-staging",
    storageAccountId, storageBucketName }));
  assert.throws(() => createStagingTrashProofProbe({ targetSha: sha, serviceName: "production-api",
    storageAccountId, storageBucketName }));
  assert.throws(() => createStagingTrashProofProbe({ targetSha: sha, serviceName: "dayli-api-staging",
    storageAccountId, storageBucketName: "production/media" }));
});
