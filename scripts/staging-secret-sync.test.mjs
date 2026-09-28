import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertPushKeyVersionGuard,
  readStagingWorkerSecretSource,
  readWorkerPushKeyVersion,
  syncStagingWorkerSecrets,
} from "./staging-secret-sync.mjs";

const sourceEnvironment = {
  BETTER_AUTH_SECRET: "better-auth-secret-value",
  FCM_SERVICE_ACCOUNT_JSON: '{"private_key":"test"}',
  PUSH_TOKEN_ENCRYPTION_KEY: "push-key-value",
  STAGING_PUSH_TOKEN_ENCRYPTION_KEY_VERSION: "v1",
};

test("accepts only required secrets and complete optional push integration", () => {
  assert.deepEqual(readStagingWorkerSecretSource(sourceEnvironment, ["BETTER_AUTH_SECRET"]), {
    values: {
      BETTER_AUTH_SECRET: "better-auth-secret-value",
      FCM_SERVICE_ACCOUNT_JSON: '{"private_key":"test"}',
      PUSH_TOKEN_ENCRYPTION_KEY: "push-key-value",
    },
    pushKeyVersion: "v1",
  });
  assert.throws(() => readStagingWorkerSecretSource({ BETTER_AUTH_SECRET: "x", FCM_SERVICE_ACCOUNT_JSON: "x" }, ["BETTER_AUTH_SECRET"]), /set together/);
  assert.throws(() => readStagingWorkerSecretSource({}, ["BETTER_AUTH_SECRET"]), /BETTER_AUTH_SECRET/);
  assert.throws(() => readStagingWorkerSecretSource(sourceEnvironment, ["ARBITRARY_SECRET"]), /unreviewed/);
});

test("requires deployed key-version metadata before replacing an existing key", () => {
  const source = readStagingWorkerSecretSource(sourceEnvironment, ["BETTER_AUTH_SECRET"]);
  assert.throws(() => assertPushKeyVersionGuard({ source, deployedSecretNames: new Set(["PUSH_TOKEN_ENCRYPTION_KEY"]), deployedPushKeyVersion: undefined }), /owner bootstrap/);
  assert.doesNotThrow(() => assertPushKeyVersionGuard({ source, deployedSecretNames: new Set(["PUSH_TOKEN_ENCRYPTION_KEY"]), deployedPushKeyVersion: undefined, allowOwnerBootstrap: true }));
  assert.throws(() => assertPushKeyVersionGuard({ source, deployedSecretNames: new Set(["PUSH_TOKEN_ENCRYPTION_KEY"]), deployedPushKeyVersion: "v0" }), /controlled rotation/);
  assert.equal(readWorkerPushKeyVersion({ result: { bindings: [{ name: "PUSH_TOKEN_ENCRYPTION_KEY_VERSION", type: "plain_text", text: "v1" }] } }), "v1");
});

test("bulk sync uses reviewed names and does not leak a provider error body", async () => {
  const source = readStagingWorkerSecretSource(sourceEnvironment, ["BETTER_AUTH_SECRET"]);
  let request;
  await syncStagingWorkerSecrets({
    accountId: "a".repeat(32), workerName: "dayli-api-staging", apiToken: "runner-token", source,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ errors: [{ message: "push-key-value should never appear" }] }), { status: 403 });
    },
  }).then(() => assert.fail("expected sync to fail"), (error) => {
    assert.match(error.message, /HTTP 403/);
    assert.doesNotMatch(error.message, /push-key-value|runner-token/);
  });
  assert.match(request.url, /dayli-api-staging\/secrets$/);
  assert.equal(request.options.method, "PUT");
  assert.deepEqual(JSON.parse(request.options.body).map(({ name }) => name).sort(), ["BETTER_AUTH_SECRET", "FCM_SERVICE_ACCOUNT_JSON", "PUSH_TOKEN_ENCRYPTION_KEY"]);
  assert.doesNotMatch(request.options.body, /runner-token/);
});

test("network failure reports recovery without any secret value", async () => {
  const source = readStagingWorkerSecretSource(sourceEnvironment, ["BETTER_AUTH_SECRET"]);
  await assert.rejects(
    syncStagingWorkerSecrets({ accountId: "a".repeat(32), workerName: "dayli-api-staging", apiToken: "runner-token", source, fetchImpl: async () => { throw new Error("provider included push-key-value"); } }),
    (error) => /control plane/.test(error.message) && !error.message.includes("push-key-value"),
  );
});
