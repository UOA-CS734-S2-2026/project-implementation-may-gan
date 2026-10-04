import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../../app";
import type { PostMediaRef } from "../../shared/post-media";
import type { PostMediaRepository } from "../get-post-media.repository";
import type { GetPostMediaRouteDependencies } from "../get-post-media.route";

const fixedNow = new Date("2026-09-26T03:00:00.000Z");
const path = "/api/v1/posts/post-1/media/media-1";

const media: PostMediaRef = {
  id: "media-1",
  postId: "post-1",
  contentType: "video/mp4",
  order: 0,
  objectKey: "media/user-friend/reservation-1",
};

const resolveSession: GetPostMediaRouteDependencies["resolveSession"] = async (request) => {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer user-") ? { userId: header.slice("Bearer ".length) } : null;
};

const sign = vi.fn(async (objectKey: string, now: Date) => ({
  url: `https://storage.example.test/${objectKey}?X-Amz-Signature=secret`,
  expiresAt: new Date(now.getTime() + 300_000),
}));

function repository(findMedia: PostMediaRepository["findMedia"]): PostMediaRepository {
  return { findMedia: vi.fn(findMedia) };
}

function get(deps: Partial<GetPostMediaRouteDependencies>, url = path, user: string | null = "user-viewer") {
  return createApp({
    postMedia: { resolveSession, now: () => fixedNow, signMediaDownload: sign, ...deps },
  }).request(url, { headers: user ? { authorization: `Bearer ${user}` } : {} });
}

describe("GET /api/v1/posts/{postId}/media/{mediaId}", () => {
  it("requires a session and never looks the media up", async () => {
    const repo = repository(async () => media);
    const response = await get({ repository: repo }, path, null);

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(repo.findMedia).not.toHaveBeenCalled();
  });

  it("returns a fresh 5-minute URL for readable, attached media", async () => {
    const repo = repository(async () => media);
    const response = await get({ repository: repo });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      id: "media-1",
      contentType: "video/mp4",
      order: 0,
      url: "https://storage.example.test/media/user-friend/reservation-1?X-Amz-Signature=secret",
      expiresAt: "2026-09-26T03:05:00.000Z",
    });
    expect(repo.findMedia).toHaveBeenCalledWith("user-viewer", "post-1", "media-1", fixedNow);
  });

  it("conceals missing, detached, and unreadable media as one 404", async () => {
    sign.mockClear();
    const response = await get({ repository: repository(async () => null) });

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "NOT_FOUND", message: "The media was not found." },
    });
    expect(sign).not.toHaveBeenCalled();
  });

  it("is unavailable without media storage rather than returning a null URL", async () => {
    const repo = repository(async () => media);
    const response = await get({ repository: repo, signMediaDownload: undefined });

    expect(response.status).toBe(503);
    expect(repo.findMedia).not.toHaveBeenCalled();
  });

  it("rejects an overlong media ID before any lookup", async () => {
    const repo = repository(async () => media);
    const response = await get({ repository: repo }, `/api/v1/posts/post-1/media/${"x".repeat(129)}`);

    expect(response.status).toBe(422);
    expect(repo.findMedia).not.toHaveBeenCalled();
  });

  it("keeps storage details and signed URLs out of errors and logs", async () => {
    const logged: unknown[] = [];
    const error = vi.spyOn(console, "error").mockImplementation((...args) => { logged.push(...args); });
    const failingSign = vi.fn(async () => {
      throw new Error("failed to sign media/user-friend/reservation-1?X-Amz-Signature=secret");
    });
    const response = await get({ repository: repository(async () => media), signMediaDownload: failingSign });
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).not.toContain("reservation-1");
    expect(JSON.stringify(logged)).not.toContain("reservation-1");
    expect(JSON.stringify(logged)).not.toContain("Signature");
    error.mockRestore();
  });
});
