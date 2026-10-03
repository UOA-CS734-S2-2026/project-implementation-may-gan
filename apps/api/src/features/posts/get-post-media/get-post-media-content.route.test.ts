import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../app";
import type { MediaObjectStore } from "../../../infrastructure/media/r2";
import type { PostMediaRepository } from "./get-post-media.repository";

const now = new Date("2026-10-03T12:00:00.000Z");
const ref = { id: "media-1", postId: "post-1", order: 0, contentType: "image/jpeg" as const, objectKey: "media/owner/private-key" };
const resolveSession = async (request: Request) => request.headers.get("authorization") === "Bearer valid"
  ? { userId: "viewer" }
  : null;

function dependencies(findMedia: PostMediaRepository["findMedia"], fetch: MediaObjectStore["fetch"]) {
  return {
    resolveSession,
    now: () => now,
    repository: { findMedia: vi.fn(findMedia) },
    objects: { fetch: vi.fn(fetch) },
  };
}

const path = "/api/v1/posts/post-1/media/media-1/content";

describe("GET /api/v1/posts/{postId}/media/{mediaId}/content", () => {
  it("reauthorizes an anonymous request before proxying bytes", async () => {
    const deps = dependencies(async () => ref, async () => new Response(new Uint8Array([1, 2]), {
      headers: { "content-type": "image/jpeg", etag: '"safe"', "x-amz-request-id": "provider-secret" },
    }));
    const response = await createApp({ postMediaContent: deps }).request(path);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.has("x-amz-request-id")).toBe(false);
    expect(deps.repository.findMedia).toHaveBeenCalledWith(null, "post-1", "media-1", now, "parent-authorized");
    expect(deps.objects.fetch).toHaveBeenCalledWith(ref.objectKey, expect.objectContaining({ method: "GET" }));
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([1, 2]);
  });

  it("forwards range and conditional headers only after current authorization", async () => {
    const deps = dependencies(async () => ref, async (_key, request) => {
      expect(request.headers.get("range")).toBe("bytes=1-2");
      expect(request.headers.get("if-none-match")).toBe('"old"');
      return new Response(new Uint8Array([2, 3]), { status: 206, headers: { "content-range": "bytes 1-2/4" } });
    });
    const response = await createApp({ postMediaContent: deps }).request(path, {
      headers: { range: "bytes=1-2", "if-none-match": '"old"' },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 1-2/4");
  });

  it("reauthorizes HEAD without returning a body", async () => {
    const deps = dependencies(async () => ref, async (_key, request) => {
      expect(request.method).toBe("HEAD");
      return new Response(null, { headers: { "content-length": "2", "content-type": "image/jpeg" } });
    });
    const response = await createApp({ postMediaContent: deps }).request(path, { method: "HEAD" });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(await response.text()).toBe("");
  });

  it("denies a changed or detached parent without reading storage", async () => {
    const deps = dependencies(async () => null, async () => { throw new Error("must not read"); });
    const response = await createApp({ postMediaContent: deps }).request(path);
    expect(response.status).toBe(404);
    expect(deps.objects.fetch).not.toHaveBeenCalled();
  });

  it("does not downgrade invalid credentials to anonymous", async () => {
    const deps = dependencies(async () => ref, async () => new Response("bytes"));
    const response = await createApp({ postMediaContent: deps }).request(path, {
      headers: { authorization: "Bearer invalid" },
    });
    expect(response.status).toBe(401);
    expect(deps.repository.findMedia).not.toHaveBeenCalled();
    expect(deps.objects.fetch).not.toHaveBeenCalled();
  });
});
