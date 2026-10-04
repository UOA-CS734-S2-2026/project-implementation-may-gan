import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyStagingExportWorkerTarget } from "./verify-staging-export-worker-target.mjs";

const appId = "a".repeat(32);
const workerId = "b".repeat(32);
const environment = {
  CLOUDFLARE_ACCOUNT_ID: "c".repeat(32),
  CLOUDFLARE_API_TOKEN: "fixture-token-do-not-log",
  CLOUDFLARE_STAGING_HYPERDRIVE_ID: appId,
  CLOUDFLARE_STAGING_EXPORT_WORKER_HYPERDRIVE_ID: workerId,
  DATABASE_URL: "postgres://migrator:fixture-password@ep-test.neon.tech:5432/dayli_staging",
};
function config(role, overrides = {}) {
  return { success: true, result: {
    origin: { scheme: "postgres", host: "ep-test.neon.tech", port: 5432, database: "dayli_staging", user: role },
    caching: { disabled: true },
    ...overrides,
  } };
}
function responses(app = config("app"), worker = config("lifecycle_worker")) {
  const ids = [];
  return { ids, fetchImpl: async (url, options) => {
    assert.equal(options.headers.Authorization, `Bearer ${environment.CLOUDFLARE_API_TOKEN}`);
    const id = url.split("/").at(-1);
    ids.push(id);
    return { ok: true, json: async () => id === appId ? app : worker };
  } };
}

const verify = (override = {}, response = responses()) => verifyStagingExportWorkerTarget({
  environment: { ...environment, ...override }, fetchImpl: response.fetchImpl,
});

test("checks distinct app and worker configs against the same direct staging database", async () => {
  const response = responses();
  await verify({}, response);
  assert.deepEqual(response.ids, [appId, workerId]);
});

test("refuses absent, repeated, or malformed worker IDs before a provider request", async () => {
  for (const id of [undefined, "", appId, "not-an-id"]) {
    const response = responses();
    await assert.rejects(verify({ CLOUDFLARE_STAGING_EXPORT_WORKER_HYPERDRIVE_ID: id }, response));
    assert.deepEqual(response.ids, []);
  }
});

test("refuses wrong role, target, pooler origin, or cached worker config", async () => {
  const invalid = [
    config("app"),
    config("migrator"),
    config("lifecycle_worker", { origin: { ...config("lifecycle_worker").result.origin, database: "production" } }),
    config("lifecycle_worker", { origin: { ...config("lifecycle_worker").result.origin, host: "ep-test-pooler.neon.tech" } }),
    config("lifecycle_worker", { caching: { disabled: false } }),
  ];
  for (const candidate of invalid) {
    await assert.rejects(verify({}, responses(config("app"), candidate)));
  }
});

test("suppresses raw provider failures and connection secrets", async () => {
  const secrets = [environment.CLOUDFLARE_API_TOKEN, "fixture-password", "raw-provider-secret"];
  for (const fetchImpl of [
    async () => { throw new Error("raw-provider-secret"); },
    async () => ({ ok: false, json: async () => ({ error: "raw-provider-secret" }) }),
    async () => ({ ok: true, json: async () => { throw new Error("raw-provider-secret"); } }),
  ]) {
    await assert.rejects(
      verifyStagingExportWorkerTarget({ environment, fetchImpl }),
      (error) => secrets.every((secret) => !error.message.includes(secret)),
    );
  }
});
