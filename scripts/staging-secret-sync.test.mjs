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

test("uses Cloudflare's documented bulk patch endpoint and validates every returned name", async () => {
  const source = readStagingWorkerSecretSource(sourceEnvironment, ["BETTER_AUTH_SECRET"]);
  let request;
  await syncStagingWorkerSecrets({
    accountId: "a".repeat(32), workerName: "dayli-api-staging", apiToken: "runner-token", source,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify(successResult(["BETTER_AUTH_SECRET", "FCM_SERVICE_ACCOUNT_JSON"])), { status: 200 });
    },
  });
  assert.match(request.url, /dayli-api-staging\/secrets-bulk$/);
  assert.equal(request.options.method, "PATCH");
  const body = JSON.parse(request.options.body);
  assert.deepEqual(Object.keys(body.secrets).sort(), ["BETTER_AUTH_SECRET", "FCM_SERVICE_ACCOUNT_JSON"]);
  assert.equal(body.secrets.PUSH_TOKEN_ENCRYPTION_KEY, undefined);
  assert.doesNotMatch(request.options.body, /push-key-value|runner-token/);
});

test("rejects malformed, partial, or provider-error bulk responses without leaking values", async () => {
  const source = readStagingWorkerSecretSource(sourceEnvironment, ["BETTER_AUTH_SECRET"]);
  for (const response of [
    new Response("not json", { status: 200 }),
    new Response(JSON.stringify(successResult(["BETTER_AUTH_SECRET"])), { status: 200 }),
    new Response(JSON.stringify({ ...successResult(["BETTER_AUTH_SECRET", "FCM_SERVICE_ACCOUNT_JSON"]), errors: [{ message: "push-key-value" }] }), { status: 200 }),
    new Response(JSON.stringify({ success: false, errors: [{ message: "push-key-value" }] }), { status: 403 }),
  ]) {
    await assert.rejects(
      syncStagingWorkerSecrets({ accountId: "a".repeat(32), workerName: "dayli-api-staging", apiToken: "runner-token", source, fetchImpl: async () => response }),
      (error) => !error.message.includes("push-key-value") && !error.message.includes("runner-token"),
    );
  }
});

test("network failure reports recovery without any secret value", async () => {
  const source = readStagingWorkerSecretSource(sourceEnvironment, ["BETTER_AUTH_SECRET"]);
  await assert.rejects(
    syncStagingWorkerSecrets({ accountId: "a".repeat(32), workerName: "dayli-api-staging", apiToken: "runner-token", source, fetchImpl: async () => { throw new Error("provider included push-key-value"); } }),
    (error) => /control plane/.test(error.message) && !error.message.includes("push-key-value"),
  );
});
