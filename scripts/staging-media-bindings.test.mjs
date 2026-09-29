import assert from "node:assert/strict";
import { test } from "node:test";
import { assertStagingR2BucketAccess, readStagingMediaBindings } from "./staging-media-bindings.mjs";

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

const r2Access = {
  accountId,
  bucketName: "dayli-media-staging",
  accessKeyId: "test-access-key-id",
  secretAccessKey: "test-secret-access-key",
};

function fakeClient(respond) {
  const urls = [];
  return {
    urls,
    fetch: async (url) => {
      urls.push(url);
      return respond();
    },
  };
}

test("lists one key from the named bucket on the account's R2 endpoint", async () => {
  const client = fakeClient(() => new Response("<ListBucketResult/>", { status: 200 }));
  await assertStagingR2BucketAccess(r2Access, client);
  assert.deepEqual(client.urls, [
    `https://${accountId}.r2.cloudflarestorage.com/dayli-media-staging?list-type=2&max-keys=1`,
  ]);
});

test("signs the bucket check with the R2 keys by default", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (request) => {
    requests.push(request);
    return new Response(null, { status: 200 });
  });
  await assertStagingR2BucketAccess(r2Access);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "GET");
  assert.equal(new URL(requests[0].url).host, `${accountId}.r2.cloudflarestorage.com`);
  assert.match(
    requests[0].headers.get("authorization"),
    /^AWS4-HMAC-SHA256 Credential=test-access-key-id\/\d{8}\/auto\/s3\/aws4_request, /,
  );
});

test("names a missing bucket separately from unusable keys", async () => {
  await assert.rejects(
    assertStagingR2BucketAccess(r2Access, fakeClient(() => new Response("<Error/>", { status: 404 }))),
    /STAGING_R2_BUCKET_NAME is not a bucket/,
  );
  for (const status of [401, 403]) {
    await assert.rejects(
      assertStagingR2BucketAccess(r2Access, fakeClient(() => new Response("<Error/>", { status }))),
      /cannot list STAGING_R2_BUCKET_NAME/,
    );
  }
});

test("fails closed on other statuses and network errors without echoing the URL", async () => {
  await assert.rejects(
    assertStagingR2BucketAccess(r2Access, fakeClient(() => new Response(null, { status: 500 }))),
    (error) => error.message === "Staging R2 validation failed (HTTP 500).",
  );
  await assert.rejects(
    assertStagingR2BucketAccess(r2Access, fakeClient(() => {
      throw new TypeError(`fetch failed for https://${accountId}.r2.cloudflarestorage.com/?X-Amz-Signature=secret`);
    })),
    (error) => error.message === "Staging R2 validation could not reach R2.",
  );
});
