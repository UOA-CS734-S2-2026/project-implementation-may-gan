import assert from "node:assert/strict";
import { test } from "node:test";
import { readStagingMediaBindings } from "./staging-media-bindings.mjs";

const accountId = "a".repeat(32);

test("keeps R2 absent when the bucket variable is unset or blank", () => {
  for (const environment of [{}, { STAGING_R2_BUCKET_NAME: "" }]) {
    assert.deepEqual(readStagingMediaBindings(environment, accountId), { vars: {}, requiredSecrets: [] });
  }
});

test("passes the bucket and account and requires both S3 key secrets", () => {
  assert.deepEqual(readStagingMediaBindings({ STAGING_R2_BUCKET_NAME: "dayli-media-staging" }, accountId), {
    vars: { R2_ACCOUNT_ID: accountId, R2_BUCKET_NAME: "dayli-media-staging" },
    requiredSecrets: ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"],
  });
});

test("rejects invalid bucket names and account IDs", () => {
  for (const bucket of ["ab", "Dayli-Media", "-leading", "trailing-", "has space", "x".repeat(64), " dayli-media-staging"]) {
    assert.throws(() => readStagingMediaBindings({ STAGING_R2_BUCKET_NAME: bucket }, accountId), /valid R2 bucket name/);
  }
  assert.throws(() => readStagingMediaBindings({ STAGING_R2_BUCKET_NAME: "dayli-media-staging" }, "not-an-id"), /account ID/);
});
