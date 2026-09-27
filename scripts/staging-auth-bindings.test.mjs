import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertRequiredWorkerSecrets,
  readCloudflareSecretNames,
  readStagingAuthBindings,
} from "./staging-auth-bindings.mjs";

const completeGoogle = {
  STAGING_GOOGLE_WEB_CLIENT_ID: "web-client-id",
  STAGING_GOOGLE_IOS_CLIENT_ID: "ios-client-id",
  STAGING_GOOGLE_ANDROID_CLIENT_ID: "android-client-id",
};

test("keeps Google and Resend absent when every public provider variable is blank", () => {
  assert.deepEqual(readStagingAuthBindings({}), {
    vars: {},
    requiredSecrets: ["BETTER_AUTH_SECRET"],
  });
});

test("passes all public provider bindings and requires their secret binding names", () => {
  const bindings = readStagingAuthBindings({
    ...completeGoogle,
    STAGING_RESEND_FROM: "Dayli <auth@staging.example.test>",
  });

  assert.deepEqual(bindings, {
    vars: {
      GOOGLE_WEB_CLIENT_ID: "web-client-id",
      GOOGLE_IOS_CLIENT_ID: "ios-client-id",
      GOOGLE_ANDROID_CLIENT_ID: "android-client-id",
      RESEND_FROM: "Dayli <auth@staging.example.test>",
    },
    requiredSecrets: ["BETTER_AUTH_SECRET", "GOOGLE_CLIENT_SECRET", "RESEND_API_KEY"],
  });
});

test("rejects every partial Google public binding tuple and invalid Resend sender", () => {
  for (const missing of Object.keys(completeGoogle)) {
    const values = { ...completeGoogle };
    delete values[missing];
    assert.throws(() => readStagingAuthBindings(values), /All three staging Google client ID variables/);
  }
  assert.throws(
    () => readStagingAuthBindings({ STAGING_RESEND_FROM: "auth@staging.example.test" }),
    /display name and email address/,
  );
});

test("reads only Cloudflare secret binding names and gates a deploy without secret values", () => {
  const secretNames = readCloudflareSecretNames({
    result: [
      { name: "BETTER_AUTH_SECRET", type: "secret_text" },
      { name: "GOOGLE_CLIENT_SECRET", type: "secret_text" },
    ],
  });

  assert.deepEqual([...secretNames].sort(), ["BETTER_AUTH_SECRET", "GOOGLE_CLIENT_SECRET"]);
  assertRequiredWorkerSecrets(secretNames, ["BETTER_AUTH_SECRET", "GOOGLE_CLIENT_SECRET"]);
  assert.throws(
    () => assertRequiredWorkerSecrets(secretNames, ["BETTER_AUTH_SECRET", "RESEND_API_KEY"]),
    /RESEND_API_KEY/,
  );
  assert.throws(
    () => assertRequiredWorkerSecrets(secretNames, ["BETTER_AUTH_SECRET"]),
    /GOOGLE_CLIENT_SECRET without its complete public provider bindings/,
  );
  assert.throws(
    () => assertRequiredWorkerSecrets(new Set(["BETTER_AUTH_SECRET", "RESEND_API_KEY"]), ["BETTER_AUTH_SECRET"]),
    /RESEND_API_KEY without its complete public provider bindings/,
  );
  assert.throws(() => readCloudflareSecretNames({ result: [{ type: "secret_text" }] }));
});
