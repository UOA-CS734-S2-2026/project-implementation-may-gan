import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPresignedDownloadUrl,
  createPresignedUploadUrl,
  createR2MediaObjectStore,
  deleteR2Object,
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

  it("accepts only the reserved local account at a loopback HTTP fixture", () => {
    const local = {
      R2_ACCOUNT_ID: "local-e2e",
      R2_BUCKET_NAME: configuration.bucketName,
      R2_ACCESS_KEY_ID: configuration.accessKeyId,
      R2_SECRET_ACCESS_KEY: configuration.secretAccessKey,
      R2_LOCAL_ENDPOINT: "http://127.0.0.1:49123",
    };
    expect(readR2RuntimeConfiguration(local)).toEqual({
      accountId: "local-e2e",
      bucketName: configuration.bucketName,
      accessKeyId: configuration.accessKeyId,
      secretAccessKey: configuration.secretAccessKey,
      localEndpoint: "http://127.0.0.1:49123",
    });
    expect(readR2RuntimeConfiguration({ ...local, R2_ACCOUNT_ID: "production" })).toBeUndefined();
    expect(readR2RuntimeConfiguration({ ...local, R2_LOCAL_ENDPOINT: "https://example.com" })).toBeUndefined();
  });
});

describe("createPresignedUploadUrl", () => {
  it("rejects an unreviewed prefix through aliases and direct signing arguments", async () => {
    const key = "private/unreviewed/archive";
    const base = { contentType: "image/jpeg", byteSize: 1024, expiresInSeconds: 900 };
    await expect(createPresignedUploadUrl(configuration, { ...base, objectKey: key })).rejects.toThrow(/owned-media namespace/);
    await expect(createPresignedUploadUrl(configuration, { ...base, objectKey: "private/unreviewed/direct" }))
      .rejects.toThrow(/owned-media namespace/);
    await expect(createPresignedUploadUrl(configuration, { ...base, objectKey: "media/owner/../../secret" }))
      .rejects.toThrow(/owned-media namespace/);
  });

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

describe("createR2MediaObjectStore", () => {
  it("signs an internal request and forwards only supported read preconditions", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array([1]), {
      status: 206,
      headers: { "content-range": "bytes 0-0/1" },
    }));
    const requestHeaders = new Headers({
      range: "bytes=0-0",
      "if-range": '"previous-avatar"',
      "if-none-match": '"etag"',
      authorization: "Bearer user-session",
      cookie: "private=cookie",
    });

    const response = await createR2MediaObjectStore(configuration).fetch("media/user/object", {
      method: "GET",
      headers: requestHeaders,
    });

    expect(response.status).toBe(206);
    const [input, init] = fetch.mock.calls[0]!;
    const sent = input instanceof Request ? input.headers : new Headers(init?.headers);
    expect(sent.get("range")).toBe("bytes=0-0");
    expect(sent.get("if-range")).toBe('"previous-avatar"');
    expect(sent.get("if-none-match")).toBe('"etag"');
    expect(sent.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 /);
    expect(sent.get("authorization")).not.toContain("user-session");
    expect(sent.has("cookie")).toBe(false);
    expect(sent.get("x-amz-security-token")).toBeNull();
  });
});

describe("createPresignedDownloadUrl", () => {
  const now = new Date("2026-09-09T12:00:00.000Z");

  it("builds a GET URL for one object that expires with its reported time", async () => {
    const download = await createPresignedDownloadUrl(configuration, {
      objectKey: "media/user_alice/media_abc123",
      expiresInSeconds: 300,
      now,
    });

    const url = new URL(download.url);
    expect(url.hostname).toBe(`${configuration.accountId}.r2.cloudflarestorage.com`);
    expect(url.pathname).toBe(`/${configuration.bucketName}/media/user_alice/media_abc123`);
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("X-Amz-Date")).toBe("20260909T120000Z");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
    expect(url.searchParams.get("X-Amz-Signature")).toBeTruthy();
    expect(download.expiresAt).toEqual(new Date("2026-09-09T12:05:00.000Z"));
    expect(download.url).not.toContain(configuration.secretAccessKey);
  });

  it("signs each object separately", async () => {
    const sign = (objectKey: string) => createPresignedDownloadUrl(configuration, { objectKey, expiresInSeconds: 300, now });
    const first = new URL((await sign("media/user_alice/a")).url).searchParams.get("X-Amz-Signature");
    const second = new URL((await sign("media/user_alice/b")).url).searchParams.get("X-Amz-Signature");
    expect(first).not.toEqual(second);
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

describe("deleteR2Object", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends one signed DELETE for the object key and treats 204 and 404 as success", async () => {
    for (const status of [204, 404]) {
      const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status }));
      vi.stubGlobal("fetch", fetchMock);
      await expect(deleteR2Object(configuration, "media/owner/reservation")).resolves.toBeUndefined();
      const [url, init] = fetchMock.mock.calls[0] as [Request | string | URL, RequestInit | undefined];
      const request = url instanceof Request ? url : new Request(url, init);
      expect(request.method).toBe("DELETE");
      expect(new URL(request.url).pathname).toContain("media/owner/reservation");
      expect(request.headers.get("authorization")).toContain("AWS4-HMAC-SHA256");
    }
  });

  it("wraps an unexpected status and a raw network error in R2ReadInfrastructureError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
    await expect(deleteR2Object(configuration, "media/o/r")).rejects.toBeInstanceOf(R2ReadInfrastructureError);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network error")));
    await expect(deleteR2Object(configuration, "media/o/r")).rejects.toBeInstanceOf(R2ReadInfrastructureError);
  });
});
