import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertProjectedWorkerSecretPairing,
  readStagingWorkerSecretSource,
  syncStagingWorkerSecrets,
} from "./staging-secret-sync.mjs";

const sourceEnvironment = {
  BETTER_AUTH_SECRET: "better-auth-secret-value",
  FCM_SERVICE_ACCOUNT_JSON: '{"private_key":"test"}',
  // This extra environment value must not be read or transmitted by routine sync.
  PUSH_TOKEN_ENCRYPTION_KEY: "push-key-value",
};

function successResult(names) {
  return { success: true, errors: [], result: Object.fromEntries(names.map((name) => [name, { name, type: "secret_text" }])) };
}

function secretList(names = ["BETTER_AUTH_SECRET", "FCM_SERVICE_ACCOUNT_JSON", "OTHER_EXISTING_SECRET"]) {
  return { success: true, errors: [], result: names.map((name) => ({ name })) };
}

function mockBulkAndReadback(payload, names) {
  return async (url, options) => new Response(JSON.stringify(options?.method === "PATCH" ? payload : secretList(names)), { status: 200 });
}

test("sync source excludes the push encryption key even when it is present", () => {
  assert.deepEqual(readStagingWorkerSecretSource(sourceEnvironment, ["BETTER_AUTH_SECRET"]), {
    values: {
      BETTER_AUTH_SECRET: "better-auth-secret-value",
      FCM_SERVICE_ACCOUNT_JSON: '{"private_key":"test"}',
    },
  });
  assert.throws(() => readStagingWorkerSecretSource({}, ["BETTER_AUTH_SECRET"]), /BETTER_AUTH_SECRET/);
  assert.throws(() => readStagingWorkerSecretSource(sourceEnvironment, ["ARBITRARY_SECRET"]), /unreviewed/);
});

test("supports the initial no-push release without FCM or a push key", () => {
  const source = readStagingWorkerSecretSource({ BETTER_AUTH_SECRET: "test-auth" }, ["BETTER_AUTH_SECRET"]);
  assert.deepEqual(source.values, { BETTER_AUTH_SECRET: "test-auth" });
  assert.doesNotThrow(() => assertProjectedWorkerSecretPairing({
    existingSecretNames: new Set(), source, requiredAuthSecretNames: ["BETTER_AUTH_SECRET"],
  }));
});

test("requires public provider pairing and a Cloudflare-provisioned key for FCM", () => {
  const source = readStagingWorkerSecretSource(sourceEnvironment, ["BETTER_AUTH_SECRET"]);
  assert.throws(
    () => assertProjectedWorkerSecretPairing({ existingSecretNames: new Set(), source, requiredAuthSecretNames: ["BETTER_AUTH_SECRET"] }),
    /PUSH_TOKEN_ENCRYPTION_KEY/,
  );
  assert.doesNotThrow(() => assertProjectedWorkerSecretPairing({
    existingSecretNames: new Set(["PUSH_TOKEN_ENCRYPTION_KEY"]), source, requiredAuthSecretNames: ["BETTER_AUTH_SECRET"],
  }));
  assert.throws(
    () => assertProjectedWorkerSecretPairing({ existingSecretNames: new Set(["GOOGLE_CLIENT_SECRET"]), source: { values: { BETTER_AUTH_SECRET: "x" } }, requiredAuthSecretNames: ["BETTER_AUTH_SECRET"] }),
    /GOOGLE_CLIENT_SECRET.*public staging/,
  );
  assert.throws(
    () => assertProjectedWorkerSecretPairing({ existingSecretNames: new Set(["RESEND_API_KEY"]), source: { values: { BETTER_AUTH_SECRET: "x" } }, requiredAuthSecretNames: ["BETTER_AUTH_SECRET"] }),
    /RESEND_API_KEY.*public staging/,
  );
  assert.throws(
    () => assertProjectedWorkerSecretPairing({ existingSecretNames: new Set(["FCM_SERVICE_ACCOUNT_JSON"]), source: { values: { BETTER_AUTH_SECRET: "x" } }, requiredAuthSecretNames: ["BETTER_AUTH_SECRET"] }),
    /FCM_SERVICE_ACCOUNT_JSON requires/,
  );
});

test("uses the bulk endpoint then verifies secret names without exposing values", async () => {
  const source = readStagingWorkerSecretSource(sourceEnvironment, ["BETTER_AUTH_SECRET"]);
  const requests = [];
  await syncStagingWorkerSecrets({
    accountId: "a".repeat(32), workerName: "dayli-api-staging", apiToken: "runner-token", source,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify(options?.method === "PATCH"
        ? successResult(["BETTER_AUTH_SECRET", "FCM_SERVICE_ACCOUNT_JSON", "OTHER_EXISTING_SECRET"])
        : secretList()), { status: 200 });
    },
  });
  assert.equal(requests.length, 2);
  assert.match(requests[0].url, /dayli-api-staging\/secrets-bulk$/);
  assert.equal(requests[0].options.method, "PATCH");
  assert.match(requests[1].url, /dayli-api-staging\/secrets$/);
  assert.equal(requests[1].options.method, undefined);
  const body = JSON.parse(requests[0].options.body);
  assert.deepEqual(Object.keys(body.secrets).sort(), ["BETTER_AUTH_SECRET", "FCM_SERVICE_ACCOUNT_JSON"]);
  assert.equal(body.secrets.PUSH_TOKEN_ENCRYPTION_KEY, undefined);
  assert.doesNotMatch(requests[0].options.body, /push-key-value|runner-token/);
});

test("accepts documented success without metadata or with unrelated map keys", async () => {
  const source = readStagingWorkerSecretSource(sourceEnvironment, ["BETTER_AUTH_SECRET"]);
  for (const payload of [
    { success: true, errors: [] },
    { success: true, errors: [], result: {
      foo: { name: "BETTER_AUTH_SECRET", type: "secret_text" },
      bar: { name: "FCM_SERVICE_ACCOUNT_JSON", type: "secret_text" },
    } },
  ]) {
    await syncStagingWorkerSecrets({
      accountId: "a".repeat(32), workerName: "dayli-api-staging", apiToken: "runner-token", source,
      fetchImpl: mockBulkAndReadback(payload),
    });
  }
});

test("rejects malformed, partial, or provider-error bulk responses without leaking values", async () => {
  const source = readStagingWorkerSecretSource(sourceEnvironment, ["BETTER_AUTH_SECRET"]);
  for (const response of [
    new Response("not json", { status: 200 }),

    new Response(JSON.stringify({ ...successResult(["BETTER_AUTH_SECRET", "FCM_SERVICE_ACCOUNT_JSON"]), errors: [{ message: "push-key-value" }] }), { status: 200 }),
    new Response(JSON.stringify({ success: false, errors: [{ message: "push-key-value" }] }), { status: 403 }),
  ]) {
    await assert.rejects(
      syncStagingWorkerSecrets({ accountId: "a".repeat(32), workerName: "dayli-api-staging", apiToken: "runner-token", source, fetchImpl: async () => response }),
      (error) => !error.message.includes("push-key-value") && !error.message.includes("runner-token"),
    );
  }
});

test("stops deployment when secret-name readback is missing or unavailable", async () => {
  const source = readStagingWorkerSecretSource(sourceEnvironment, ["BETTER_AUTH_SECRET"]);
  const params = { accountId: "a".repeat(32), workerName: "dayli-api-staging", apiToken: "runner-token", source };
  for (const fetchImpl of [
    mockBulkAndReadback({ success: true, errors: [] }, ["BETTER_AUTH_SECRET"]),
    async (_url, options) => options?.method === "PATCH"
      ? new Response(JSON.stringify({ success: true, errors: [] }), { status: 200 })
      : new Response("unavailable", { status: 503 }),
  ]) {
    await assert.rejects(syncStagingWorkerSecrets({ ...params, fetchImpl }), /verification failed/);
  }
});

test("network failure reports recovery without any secret value", async () => {
  const source = readStagingWorkerSecretSource(sourceEnvironment, ["BETTER_AUTH_SECRET"]);
  await assert.rejects(
    syncStagingWorkerSecrets({ accountId: "a".repeat(32), workerName: "dayli-api-staging", apiToken: "runner-token", source, fetchImpl: async () => { throw new Error("provider included push-key-value"); } }),
    (error) => /control plane/.test(error.message) && !error.message.includes("push-key-value"),
  );
});
