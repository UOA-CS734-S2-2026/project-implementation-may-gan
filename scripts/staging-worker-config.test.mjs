import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createStagingWorkerConfigs, rateLimitConfig, readStagingBrowserProxyMode, serializeWranglerConfig } from "./staging-worker-config.mjs";

const input = {
  workerName: "dayli-api-staging",
  hyperdriveId: "a".repeat(32),
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
  assert.equal(api.vars.BETTER_AUTH_BASE_URL, "https://api.staging.example.test");
  assert.equal(api.vars.PUBLIC_API_BASE_URL, "https://api.staging.example.test");
  assert.equal(api.vars.PUSH_TOKEN_ENCRYPTION_KEY_VERSION, undefined);
  assert.equal(JSON.parse(serializeWranglerConfig(api)).name, "dayli-api-staging");
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
  }
});

test("keeps the remote service probe free of cron and shared Durable Object bindings", () => {
  const { probe } = createStagingWorkerConfigs(input);
  assert.equal(probe.main, "src/features/system/hyperdrive/test-worker.ts");
  assert.equal(probe.triggers, undefined);
  assert.equal(probe.durable_objects, undefined);
  assert.equal(probe.migrations, undefined);
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
  assert.equal(probe.vars, undefined);
  assert.equal(createStagingWorkerConfigs(input).api.vars.R2_BUCKET_NAME, undefined);
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

  const proofVars = {
    STAGING_EXPORT_PROOF_APPROVED: "synthetic-only",
    STAGING_EXPORT_PROOF_USER_ID: "synthetic-owner-123",
    STAGING_EXPORT_PROOF_BUILD_UNTIL: "2026-10-04T00:30:00.000Z",
    STAGING_EXPORT_PROOF_CLEANUP_REVIEW_AFTER: "2026-10-06T01:00:00.000Z",
  };
  assert.deepEqual(createStagingWorkerConfigs({ ...input, exportWorkerHyperdriveId: workerId, exportProofVars: proofVars }).api.vars,
    { API_RATE_LIMIT_SCOPE: "staging", BETTER_AUTH_BASE_URL: input.authApiOrigin,
      PUBLIC_API_BASE_URL: input.authApiOrigin,
      BETTER_AUTH_TRUSTED_ORIGINS: `${input.authApiOrigin},${input.authWebOrigin}`,
      ...input.authVars, ...proofVars });
  assert.throws(() => createStagingWorkerConfigs({ ...input, exportProofVars: proofVars }));
  assert.throws(() => createStagingWorkerConfigs({ ...input, exportWorkerHyperdriveId: input.hyperdriveId }));
  assert.throws(() => createStagingWorkerConfigs({ ...input, exportWorkerHyperdriveId: workerId,
    exportProofVars: { STAGING_EXPORT_PROOF_USER_ID: proofVars.STAGING_EXPORT_PROOF_USER_ID } }));
  assert.throws(() => createStagingWorkerConfigs({ ...input, exportWorkerHyperdriveId: workerId,
    exportProofVars: { ...proofVars, STAGING_EXPORT_PROOF_APPROVED: "all-accounts" } }));
});

test("rejects an unreviewed Worker target or Hyperdrive ID", () => {
  assert.throws(() => createStagingWorkerConfigs({ ...input, workerName: "production-api" }));
  assert.throws(() => createStagingWorkerConfigs({ ...input, hyperdriveId: "not-an-id" }));
});
