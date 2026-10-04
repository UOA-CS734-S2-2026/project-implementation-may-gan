import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../../app";
import type { MediaObjectStore } from "../../../../infrastructure/media/r2";
import type { AvatarContentRepository } from "../../shared/avatar-content.repository";

const now = new Date("2026-10-03T12:00:00.000Z");
const path = "/api/v1/profiles/alice/avatar";
const avatar = { objectKey: "media/alice/avatar-private", contentType: "image/jpeg" as const };

function dependencies(findAvatar: AvatarContentRepository["findAvatar"], fetch: MediaObjectStore["fetch"]) {
  return {
    resolveSession: async (request: Request) => request.headers.get("authorization") === "Bearer blocked"
      ? { userId: "blocked-viewer" }
      : null,
    now: () => now,
    repository: { findAvatar: vi.fn(findAvatar) },
    objects: { fetch: vi.fn(fetch) },
  };
}

describe("GET /api/v1/profiles/{username}/avatar", () => {
  it("streams an anonymous public avatar without exposing its object key", async () => {
    const deps = dependencies(async () => avatar, async () => new Response(new Uint8Array([4, 5]), {
      headers: { "content-type": "image/jpeg" },
    }));
    const response = await createApp({ profileAvatar: deps }).request(path);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(deps.repository.findAvatar).toHaveBeenCalledWith(null, "alice", now);
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([4, 5]);
  });

  it("returns the complete replacement when a range validator names an old avatar", async () => {
    const replacement = new Uint8Array([7, 8, 9, 10]);
    const deps = dependencies(async () => avatar, async (_objectKey, request) => {
      expect(request.headers.get("range")).toBe("bytes=2-3");
      expect(request.headers.get("if-range")).toBe('"old-avatar"');
      return new Response(replacement, {
        status: 200,
        headers: { "content-type": "image/jpeg", etag: '"new-avatar"', "content-length": String(replacement.byteLength) },
      });
    });
    const response = await createApp({ profileAvatar: deps }).request(path, {
      headers: { range: "bytes=2-3", "if-range": '"old-avatar"' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe('"new-avatar"');
    expect(response.headers.get("content-range")).toBeNull();
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([7, 8, 9, 10]);
  });

  it("passes a verified actor to the current profile decision", async () => {
    const deps = dependencies(async () => null, async () => new Response("must not read"));
    const response = await createApp({ profileAvatar: deps }).request(path, {
      headers: { authorization: "Bearer blocked" },
    });

    expect(response.status).toBe(404);
    expect(deps.repository.findAvatar).toHaveBeenCalledWith("blocked-viewer", "alice", now);
    expect(deps.objects.fetch).not.toHaveBeenCalled();
  });

  it("fails closed when storage is unavailable", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = dependencies(async () => avatar, async () => { throw new Error("provider credential details"); });
    const response = await createApp({ profileAvatar: deps }).request(path);

    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("provider credential");
    error.mockRestore();
  });
});
