import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../app";
import type { PostDetailRecord, PostDetailRepository } from "./get-post.repository";
import type { GetPostRouteDependencies } from "./get-post.route";

const fixedNow = new Date("2026-09-26T03:00:00.000Z");

const detail: PostDetailRecord = {
  id: "post-1",
  author: { id: "user-friend", username: "friend", displayName: "Friend" },
  localDate: "2026-09-25",
  prompt: { id: "prompt-09-25", text: "What made you smile today?" },
  reflectiveAnswer: "Walked to the harbour.",
  caption: "Sunset",
  rating: 7,
  audience: "friends",
  acceptedAt: "2026-09-25T03:00:00.000Z",
  releasedAt: "2026-09-25T12:00:00.000Z",
  edited: false,
  viewerIsAuthor: false,
  media: [],
};

const resolveSession: GetPostRouteDependencies["resolveSession"] = async (request) => {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer user-") ? { userId: header.slice("Bearer ".length) } : null;
};

function get(deps: Partial<GetPostRouteDependencies>, path = "/api/v1/posts/post-1", user: string | null = "user-viewer") {
  return createApp({ postDetail: { resolveSession, now: () => fixedNow, ...deps } }).request(path, {
    headers: user ? { authorization: `Bearer ${user}` } : {},
  });
}

function repository(findPost: PostDetailRepository["findPost"]): PostDetailRepository {
  return { findPost: vi.fn(findPost) };
}

describe("GET /api/v1/posts/{postId}", () => {
  it("requires a session and never reads the post", async () => {
    const repo = repository(async () => detail);
    const response = await get({ repository: repo }, undefined, null);

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(repo.findPost).not.toHaveBeenCalled();
  });

  it("returns a readable post for the verified actor at server time", async () => {
    const repo = repository(async () => detail);
    const response = await get({ repository: repo });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(detail);
    expect(repo.findPost).toHaveBeenCalledWith("user-viewer", "post-1", fixedNow);
  });

  it("conceals a missing or unreadable post as 404", async () => {
    const response = await get({ repository: repository(async () => null) });

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ error: { code: "NOT_FOUND", message: "The post was not found." } });
  });

  it("rejects an overlong post ID", async () => {
    const repo = repository(async () => detail);
    const response = await get({ repository: repo }, `/api/v1/posts/${"x".repeat(129)}`);

    expect(response.status).toBe(422);
    expect(repo.findPost).not.toHaveBeenCalled();
  });

  it("conceals storage failures", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await get({ repository: repository(async () => { throw new Error("relation \"posts\" does not exist"); }) });

    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("posts\"");
    error.mockRestore();
  });

  it("is unavailable when no repository is configured", async () => {
    const response = await get({});

    expect(response.status).toBe(503);
  });

  it("does not add a second session check to post creation", async () => {
    const detailSession = vi.fn(resolveSession);
    const response = await createApp({ postDetail: { resolveSession: detailSession } }).request("/api/v1/posts", {
      method: "POST",
      headers: { authorization: "Bearer user-viewer", "content-type": "application/json", "idempotency-key": "k" },
      body: "{}",
    });

    expect(response.status).toBe(401);
    expect(detailSession).not.toHaveBeenCalled();
  });

  describe("media", () => {
    const withMedia: PostDetailRecord = {
      ...detail,
      media: [
        { id: "media-1", postId: "post-1", contentType: "image/jpeg", order: 0, objectKey: "media/user-friend/reservation-1" },
        { id: "media-2", postId: "post-1", contentType: "image/png", order: 1, objectKey: "media/user-friend/reservation-2" },
      ],
    };

    it("signs each attachment for this response and never exposes object keys", async () => {
      const sign = vi.fn(async (objectKey: string, now: Date) => ({
        url: `https://storage.example.test/${objectKey}?signature=abc`,
        expiresAt: new Date(now.getTime() + 300_000),
      }));
      const response = await get({ repository: repository(async () => withMedia), signMediaDownload: sign });
      const body = await response.json<{ media: unknown[] }>();

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(body.media).toEqual([
        {
          id: "media-1",
          contentType: "image/jpeg",
          order: 0,
          url: "https://storage.example.test/media/user-friend/reservation-1?signature=abc",
          expiresAt: "2026-09-26T03:05:00.000Z",
        },
        {
          id: "media-2",
          contentType: "image/png",
          order: 1,
          url: "https://storage.example.test/media/user-friend/reservation-2?signature=abc",
          expiresAt: "2026-09-26T03:05:00.000Z",
        },
      ]);
      expect(sign).toHaveBeenCalledWith("media/user-friend/reservation-1", fixedNow);
      expect(JSON.stringify(body.media)).not.toContain("objectKey");
      expect(JSON.stringify(body.media)).not.toContain("postId");
    });

    it("is unavailable for a post with media when storage isn't configured", async () => {
      const response = await get({ repository: repository(async () => withMedia) });

      // Never a media response without URLs: url and expiresAt are always set.
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toMatchObject({ error: { code: "SERVICE_UNAVAILABLE" } });
    });

    it("still serves a text-only post without storage", async () => {
      const response = await get({ repository: repository(async () => detail) });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ media: [] });
    });

    it("signs nothing for a post the viewer can't read", async () => {
      const sign = vi.fn();
      const response = await get({ repository: repository(async () => null), signMediaDownload: sign });
      expect(response.status).toBe(404);
      expect(sign).not.toHaveBeenCalled();
    });
  });
});
