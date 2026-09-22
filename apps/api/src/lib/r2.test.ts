import { describe, expect, it } from "vitest";
import { createPresignedUploadUrl, readR2RuntimeConfiguration } from "./r2";

const configuration = {
  accountId: "test-account",
  bucketName: "dayli-media-test",
  accessKeyId: "test-access-key-id",
  secretAccessKey: "test-secret-access-key",
};

describe("readR2RuntimeConfiguration", () => {
  it("requires every binding before returning a configuration", () => {
    expect(readR2RuntimeConfiguration({
      R2_ACCOUNT_ID: configuration.accountId,
      R2_BUCKET_NAME: configuration.bucketName,
      R2_ACCESS_KEY_ID: configuration.accessKeyId,
      R2_SECRET_ACCESS_KEY: configuration.secretAccessKey,
    })).toEqual(configuration);

    expect(readR2RuntimeConfiguration({})).toBeUndefined();
    expect(readR2RuntimeConfiguration({
      R2_ACCOUNT_ID: configuration.accountId,
      R2_BUCKET_NAME: "  ",
      R2_ACCESS_KEY_ID: configuration.accessKeyId,
      R2_SECRET_ACCESS_KEY: configuration.secretAccessKey,
    })).toBeUndefined();
  });
});

describe("createPresignedUploadUrl", () => {
  it("builds a scoped, expiring presigned PUT URL without exposing credentials", async () => {
    const now = new Date("2026-09-09T12:00:00.000Z");
    const upload = await createPresignedUploadUrl(configuration, {
      objectKey: "media/user_alice/media_abc123",
      contentType: "image/jpeg",
      byteSize: 1024,
      expiresInSeconds: 900,
      now,
    });

    expect(upload.method).toBe("PUT");
    expect(upload.requiredHeaders).toEqual({
      "content-type": "image/jpeg",
      "content-length": "1024",
    });

    const url = new URL(upload.url);
    expect(url.hostname).toBe(`${configuration.accountId}.r2.cloudflarestorage.com`);
    expect(url.pathname).toBe(`/${configuration.bucketName}/media/user_alice/media_abc123`);
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(url.searchParams.get("X-Amz-Credential")).toContain(configuration.accessKeyId);
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toContain("content-length");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toContain("content-type");
    expect(url.searchParams.get("X-Amz-Signature")).toBeTruthy();

    expect(upload.url).not.toContain(configuration.secretAccessKey);
  });

  it("produces a different signature for a different declared byte size", async () => {
    const now = new Date("2026-09-09T12:00:00.000Z");
    const base = { objectKey: "media/user_alice/media_abc123", contentType: "image/jpeg", expiresInSeconds: 900, now };

    const small = await createPresignedUploadUrl(configuration, { ...base, byteSize: 1024 });
    const large = await createPresignedUploadUrl(configuration, { ...base, byteSize: 2048 });

    const smallSignature = new URL(small.url).searchParams.get("X-Amz-Signature");
    const largeSignature = new URL(large.url).searchParams.get("X-Amz-Signature");
    expect(smallSignature).not.toEqual(largeSignature);
  });
});
