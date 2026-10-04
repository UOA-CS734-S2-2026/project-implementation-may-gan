import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createStagingWorkerConfigs, rateLimitConfig, readStagingBrowserProxyMode, serializeWranglerConfig } from "./staging-worker-config.mjs";

const input = {
  workerName: "dayli-api-staging",
  hyperdriveId: "a".repeat(32),
  releaseSha: "c".repeat(40),
  mediaVars: { R2_ACCOUNT_ID: "b".repeat(32), R2_BUCKET_NAME: "dayli-media-staging" },
  authApiOrigin: "https://api.staging.example.test",
  authWebOrigin: "https://staging.example.test",
  authVars: { GOOGLE_WEB_CLIENT_ID: "public-client-id" },
};

test("generates the staging Worker Durable Object migration and repair cron", () => {
  const { api } = createStagingWorkerConfigs(input);
  assert.deepEqual(api.durable_objects, { bindings: [{ name: "USER_REALTIME", class_name: "UserRealtime" }] });
  assert.deepEqual(api.migrations, [{ tag: "v1", new_sqlite_classes: ["UserRealtime"] }]);
  assert.deepEqual(api.triggers, { crons: ["*/1 * * * *"] });
  assert.deepEqual(api.hyperdrive, [{ binding: "HYPERDRIVE", id: "a".repeat(32) }]);
  assert.deepEqual(api.ratelimits, rateLimitConfig);
  assert.equal(api.vars.API_RATE_LIMIT_SCOPE, "staging");
  assert.equal(api.vars.STAGING_RELEASE_SHA, "c".repeat(40));
  assert.equal(api.vars.NOTIFICATION_PUBLISHERS_ENABLED, "false");
  assert.equal(api.vars.NOTIFICATION_DELIVERY_ENABLED, "false");
  assert.equal(api.vars.DIRECT_MESSAGE_SEND_LIMIT, "30");
  assert.equal(api.vars.BETTER_AUTH_BASE_URL, "https://api.staging.example.test");
  assert.equal(api.vars.PUBLIC_API_BASE_URL, "https://api.staging.example.test");
  assert.equal(api.vars.PUSH_TOKEN_ENCRYPTION_KEY_VERSION, undefined);
  assert.equal(JSON.parse(serializeWranglerConfig(api)).name, "dayli-api-staging");
});

test("activates staging notifications only through explicit options", () => {
  const { api } = createStagingWorkerConfigs({ ...input, notificationPublishersEnabled: true, notificationDeliveryEnabled: true });
  assert.equal(api.vars.NOTIFICATION_PUBLISHERS_ENABLED, "true");
  assert.equal(api.vars.NOTIFICATION_DELIVERY_ENABLED, "true");
  assert.equal(api.vars.DIRECT_MESSAGE_SEND_LIMIT, "30");
  assert.throws(() => createStagingWorkerConfigs({ ...input, notificationDeliveryEnabled: "true" }));
});

test("selects direct or proxied Better Auth origin only through the validated staging mode", () => {
  assert.equal(readStagingBrowserProxyMode(undefined), false);
  assert.equal(readStagingBrowserProxyMode("false"), false);
  assert.equal(readStagingBrowserProxyMode("true"), true);
  assert.throws(() => readStagingBrowserProxyMode("enabled"));
  const { api } = createStagingWorkerConfigs({ ...input, browserProxyEnabled: true });
  assert.equal(api.vars.BETTER_AUTH_BASE_URL, "https://staging.example.test");
  assert.equal(api.vars.PUBLIC_API_BASE_URL, "https://api.staging.example.test");
});

test("keeps native rate-limit mappings and environment scopes aligned", () => {
  const templates = [
    ["apps/api/wrangler.jsonc", "production"],
    ["apps/api/wrangler.local.example.jsonc", "local"],
    ["apps/api/wrangler.staging.example.jsonc", "staging"],
  ];
  for (const [file, scope] of templates) {
    const config = JSON.parse(readFileSync(file, "utf8"));
    assert.deepEqual(config.ratelimits, rateLimitConfig, file);
    assert.equal(config.vars.API_RATE_LIMIT_SCOPE, scope, file);
    assert.equal(config.vars.NOTIFICATION_PUBLISHERS_ENABLED, "false", file);
    assert.equal(config.vars.NOTIFICATION_DELIVERY_ENABLED, "false", file);
    assert.equal(config.vars.DIRECT_MESSAGE_SEND_LIMIT, "30", file);
  }
});

test("keeps the remote service probe private and binds exact attestation expectations", () => {
  const { probe } = createStagingWorkerConfigs(input);
  assert.equal(probe.main, "src/features/system/hyperdrive/test-worker.ts");
  assert.equal(probe.triggers, undefined);
  assert.equal(probe.durable_objects, undefined);
  assert.equal(probe.migrations, undefined);
  assert.equal(probe.vars.EXPECTED_STAGING_RELEASE_SHA, input.releaseSha);
  assert.match(probe.vars.EXPECTED_STAGING_STORAGE_DIGEST, /^[a-f0-9]{64}$/);
  assert.deepEqual(probe.services, [{
    binding: "STAGING_API",
    service: "dayli-api-staging",
    entrypoint: "HyperdriveIntegrationEntrypoint",
    remote: true,
  }]);
});

test("adds R2 media vars to the API Worker only", () => {
  const mediaVars = { R2_ACCOUNT_ID: "b".repeat(32), R2_BUCKET_NAME: "dayli-media-staging" };
  const { api, probe } = createStagingWorkerConfigs({ ...input, mediaVars });
  assert.equal(api.vars.R2_ACCOUNT_ID, "b".repeat(32));
  assert.equal(api.vars.R2_BUCKET_NAME, "dayli-media-staging");
  assert.equal(api.vars.GOOGLE_WEB_CLIENT_ID, "public-client-id");
  assert.deepEqual(probe.vars, {
    EXPECTED_STAGING_RELEASE_SHA: input.releaseSha,
    EXPECTED_STAGING_STORAGE_DIGEST: createHash("sha256").update(`${mediaVars.R2_ACCOUNT_ID}\n${mediaVars.R2_BUCKET_NAME}`).digest("hex"),
  });
  assert.equal(probe.vars.R2_ACCOUNT_ID, undefined);
  assert.equal(probe.vars.R2_BUCKET_NAME, undefined);
  assert.equal(probe.vars.GOOGLE_WEB_CLIENT_ID, undefined);
  assert.equal(createStagingWorkerConfigs(input).api.vars.R2_BUCKET_NAME, "dayli-media-staging");
});

test("binds the separate worker only on staging and requires complete synthetic proof settings", () => {
  const workerId = "d".repeat(32);
  const gated = createStagingWorkerConfigs({ ...input, exportWorkerHyperdriveId: workerId });
  assert.deepEqual(gated.api.hyperdrive, [
    { binding: "HYPERDRIVE", id: input.hyperdriveId },
    { binding: "EXPORT_WORKER_HYPERDRIVE", id: workerId },
  ]);
  assert.equal(gated.api.vars.STAGING_EXPORT_PROOF_APPROVED, undefined);
  assert.equal(gated.probe.hyperdrive, undefined);
  assert.equal(gated.probe.vars.EXPECTED_STAGING_RELEASE_SHA, input.releaseSha);
  assert.match(gated.probe.vars.EXPECTED_STAGING_STORAGE_DIGEST, /^[a-f0-9]{64}$/);

  const mediaVars = { R2_ACCOUNT_ID: "b".repeat(32), R2_BUCKET_NAME: "dayli-media-staging" };
  const proofVars = {
    STAGING_EXPORT_PROOF_APPROVED: "synthetic-only",
    STAGING_EXPORT_PROOF_USER_ID: "synthetic-owner-123",
    STAGING_EXPORT_PROOF_BUILD_UNTIL: "2026-10-04T00:30:00.000Z",
    STAGING_EXPORT_PROOF_CLEANUP_REVIEW_AFTER: "2026-10-06T01:00:00.000Z",
  };
  assert.deepEqual(createStagingWorkerConfigs({ ...input, mediaVars, exportWorkerHyperdriveId: workerId, exportProofVars: proofVars }).api.vars,
    { API_RATE_LIMIT_SCOPE: "staging", STAGING_RELEASE_SHA: input.releaseSha,
      BETTER_AUTH_BASE_URL: input.authApiOrigin,
      NOTIFICATION_PUBLISHERS_ENABLED: "false", NOTIFICATION_DELIVERY_ENABLED: "false",
      DIRECT_MESSAGE_SEND_LIMIT: "30",
      PUBLIC_API_BASE_URL: input.authApiOrigin,
      BETTER_AUTH_TRUSTED_ORIGINS: `${input.authApiOrigin},${input.authWebOrigin}`,
      ...input.authVars, ...mediaVars, ...proofVars });
  assert.throws(() => createStagingWorkerConfigs({ ...input, exportProofVars: proofVars }));
  assert.throws(() => createStagingWorkerConfigs({ ...input, exportWorkerHyperdriveId: input.hyperdriveId }));
  assert.throws(() => createStagingWorkerConfigs({ ...input, exportWorkerHyperdriveId: workerId,
    exportProofVars: { STAGING_EXPORT_PROOF_USER_ID: proofVars.STAGING_EXPORT_PROOF_USER_ID } }));
  assert.throws(() => createStagingWorkerConfigs({ ...input, exportWorkerHyperdriveId: workerId,
    exportProofVars: { ...proofVars, STAGING_EXPORT_PROOF_APPROVED: "all-accounts" } }));
});

test("explicit all-staging and cleanup-only modes require the separate worker and R2 bindings", () => {
  const workerId = "d".repeat(32);
  const mediaVars = { R2_ACCOUNT_ID: "b".repeat(32), R2_BUCKET_NAME: "dayli-media-staging" };
  const activated = { ...input, exportWorkerHyperdriveId: workerId, mediaVars };
  const approval = { STAGING_EXPORT_ALL_USERS_APPROVED: "all-staging-accounts" };
  const cleanup = { STAGING_EXPORT_CLEANUP_ONLY_APPROVED: "continue-existing-cleanup" };
  const all = createStagingWorkerConfigs({ ...activated,
    exportProofVars: { ...approval, ...cleanup } });
  assert.equal(all.api.vars.STAGING_EXPORT_ALL_USERS_APPROVED, "all-staging-accounts");
  assert.equal(all.api.vars.STAGING_EXPORT_CLEANUP_ONLY_APPROVED, "continue-existing-cleanup");
  assert.deepEqual(all.probe.vars, {
    EXPECTED_STAGING_RELEASE_SHA: input.releaseSha,
    EXPECTED_STAGING_STORAGE_DIGEST: createHash("sha256").update(`${mediaVars.R2_ACCOUNT_ID}\n${mediaVars.R2_BUCKET_NAME}`).digest("hex"),
  });
  assert.equal(createStagingWorkerConfigs({ ...activated,
    exportProofVars: cleanup }).api.vars.STAGING_EXPORT_ALL_USERS_APPROVED, undefined);
  assert.throws(() => createStagingWorkerConfigs({ ...input, mediaVars: {}, exportWorkerHyperdriveId: workerId,
    exportProofVars: cleanup }), /complete R2 bindings/);
  assert.throws(() => createStagingWorkerConfigs({ ...input, mediaVars: {}, exportWorkerHyperdriveId: workerId,
    exportProofVars: approval }), /complete R2 bindings/);
  assert.throws(() => createStagingWorkerConfigs({ ...input, exportProofVars: approval }));
  assert.throws(() => createStagingWorkerConfigs({ ...input, exportProofVars: cleanup }));
  assert.throws(() => createStagingWorkerConfigs({ ...activated,
    exportProofVars: { STAGING_EXPORT_ALL_USERS_APPROVED: "true" } }));
  assert.throws(() => createStagingWorkerConfigs({ ...activated,
    exportProofVars: { STAGING_EXPORT_CLEANUP_ONLY_APPROVED: "wrong" } }));
  assert.throws(() => createStagingWorkerConfigs({ ...activated,
    exportProofVars: { ...approval, STAGING_EXPORT_PROOF_USER_ID: "synthetic-owner-123" } }));
});

test("binds the exact attestation target without copying API-only settings", () => {
  const mediaVars = { R2_ACCOUNT_ID: "b".repeat(32), R2_BUCKET_NAME: "dayli-media-staging" };
  const original = createStagingWorkerConfigs({ ...input, mediaVars }).probe;
  const changedSha = createStagingWorkerConfigs({ ...input, releaseSha: "d".repeat(40), mediaVars }).probe;
  const changedBucket = createStagingWorkerConfigs({ ...input, mediaVars: { ...mediaVars, R2_BUCKET_NAME: "dayli-other-staging" } }).probe;
  assert.equal(changedSha.vars.EXPECTED_STAGING_RELEASE_SHA, "d".repeat(40));
  assert.equal(changedSha.vars.EXPECTED_STAGING_STORAGE_DIGEST, original.vars.EXPECTED_STAGING_STORAGE_DIGEST);
  assert.notEqual(changedBucket.vars.EXPECTED_STAGING_STORAGE_DIGEST, original.vars.EXPECTED_STAGING_STORAGE_DIGEST);
  assert.deepEqual(Object.keys(original.vars).sort(), ["EXPECTED_STAGING_RELEASE_SHA", "EXPECTED_STAGING_STORAGE_DIGEST"]);
  assert.throws(() => createStagingWorkerConfigs({ ...input, mediaVars: { R2_BUCKET_NAME: mediaVars.R2_BUCKET_NAME } }), /storage metadata/);
  assert.throws(() => createStagingWorkerConfigs({ ...input, mediaVars: { R2_ACCOUNT_ID: mediaVars.R2_ACCOUNT_ID } }), /storage metadata/);
});

test("rejects an unreviewed Worker target or Hyperdrive ID", () => {
  assert.throws(() => createStagingWorkerConfigs({ ...input, workerName: "production-api" }));
  assert.throws(() => createStagingWorkerConfigs({ ...input, hyperdriveId: "not-an-id" }));
  assert.throws(() => createStagingWorkerConfigs({ ...input, releaseSha: "main" }));
  assert.equal(createStagingWorkerConfigs({ ...input, mediaVars: {} }).probe.vars, undefined);
});
