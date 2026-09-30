import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createStagingWorkerConfigs, rateLimitConfig, serializeWranglerConfig } from "./staging-worker-config.mjs";

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
  assert.equal(api.vars.PUSH_TOKEN_ENCRYPTION_KEY_VERSION, undefined);
  assert.equal(JSON.parse(serializeWranglerConfig(api)).name, "dayli-api-staging");
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

test("rejects an unreviewed Worker target or Hyperdrive ID", () => {
  assert.throws(() => createStagingWorkerConfigs({ ...input, workerName: "production-api" }));
  assert.throws(() => createStagingWorkerConfigs({ ...input, hyperdriveId: "not-an-id" }));
});
