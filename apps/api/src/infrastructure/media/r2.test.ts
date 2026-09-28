import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPresignedUploadUrl,
  headR2Object,
  R2ReadInfrastructureError,
  readR2ObjectRange,
  readR2RuntimeConfiguration,
} from "./r2";

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
      "if-none-match": "*",
    });

    const url = new URL(upload.url);
    expect(url.hostname).toBe(`${configuration.accountId}.r2.cloudflarestorage.com`);
    expect(url.pathname).toBe(`/${configuration.bucketName}/media/user_alice/media_abc123`);
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(url.searchParams.get("X-Amz-Credential")).toContain(configuration.accessKeyId);
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toContain("content-length");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toContain("content-type");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toContain("if-none-match");
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

describe("headR2Object / readR2ObjectRange — infrastructure error wrapping", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("wraps a raw network error from fetch() in R2ReadInfrastructureError, rather than letting it escape unwrapped", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network error")));

    await expect(headR2Object(configuration, "media/owner/id")).rejects.toBeInstanceOf(R2ReadInfrastructureError);
    await expect(
      readR2ObjectRange(configuration, "media/owner/id", { start: 0, end: 9 }),
    ).rejects.toBeInstanceOf(R2ReadInfrastructureError);
  });

  it("does not double-wrap the R2ReadInfrastructureError already thrown for an unexpected status", async () => {
    // 403, not 5xx/429 — aws4fetch retries those with real backoff delays, which
    // would make this test slow/flaky for no reason relevant to what it checks.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));

    await expect(headR2Object(configuration, "media/owner/id")).rejects.toThrow(/R2 HEAD failed with status 403/);
  });

  it("treats a HEAD response with a missing or blank Content-Length as an infrastructure error, not a zero-byte object", async () => {
    // A plain object rather than `new Response(...)`, so the runtime can't fill in
    // a Content-Length on its own and mask the missing-header case.
    const headResponse = (headers: Headers) => ({ status: 200, ok: true, headers }) as Response;

    for (const headers of [new Headers(), new Headers({ "content-length": "" }), new Headers({ "content-length": "abc" })]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(headers)));
      await expect(headR2Object(configuration, "media/owner/id")).rejects.toThrow(/missing a valid Content-Length/);
    }

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(new Headers({ "content-length": "1024" }))));
    await expect(headR2Object(configuration, "media/owner/id")).resolves.toEqual({ outcome: "found", contentLength: 1024 });
  });
});
