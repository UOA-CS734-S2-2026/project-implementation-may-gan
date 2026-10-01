import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../app";
import { InvalidFeedCursorError, StaleFeedCursorError, type FeedPostRecord, type FeedRepository } from "./list-feed.repository";
import type { ListFeedRouteDependencies } from "./list-feed.route";

const fixedNow = new Date("2026-09-26T03:00:00.000Z");

const feedPost: FeedPostRecord = {
  id: "post-1",
  author: { id: "user-friend", username: "friend", displayName: "Friend" },
  localDate: "2026-09-25",
  prompt: { id: "prompt-09-25", text: "What made you smile today?" },
  reflectiveAnswer: "Walked to the harbour.",
  caption: null,
  rating: 7,
  audience: "friends",
  acceptedAt: "2026-09-25T03:00:00.000Z",
  releasedAt: "2026-09-25T12:00:00.000Z",
  edited: false,
  media: [],
};

function dependencies(
  repository?: Partial<FeedRepository>,
  signMediaDownload?: ListFeedRouteDependencies["signMediaDownload"],
): ListFeedRouteDependencies {
  return {
    resolveSession: async (request) => {
      const header = request.headers.get("authorization");
      return header?.startsWith("Bearer user-") ? { userId: header.slice("Bearer ".length) } : null;
    },
    repository: repository
      ? { listFeed: vi.fn(async () => ({ items: [feedPost], nextCursor: null, hasMore: false, feedDate: "2026-09-25" })), ...repository }
      : undefined,
    signMediaDownload,
    now: () => fixedNow,
  };
}

function get(deps: ListFeedRouteDependencies, query = "", user: string | null = "user-viewer") {
  return createApp({ feed: deps }).request(`/api/v1/feed${query}`, {
    headers: user ? { authorization: `Bearer ${user}` } : {},
  });
}

describe("GET /api/v1/feed", () => {
  it("requires a session and never invokes the repository", async () => {
    const listFeed = vi.fn();
    const response = await get(dependencies({ listFeed }), "", null);

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ error: { code: "UNAUTHENTICATED" } });
    expect(listFeed).not.toHaveBeenCalled();
  });

  it("is unavailable, not unauthenticated, when the session resolver fails", async () => {
    const response = await get({ ...dependencies({}), resolveSession: async () => { throw new Error("down"); } });

    expect(response.status).toBe(503);
  });

  it("reads the page for the verified actor with the default page size and server time", async () => {
    const listFeed = vi.fn(async () => ({ items: [feedPost], nextCursor: "next", hasMore: true, feedDate: "2026-09-25" }));
    const response = await get(dependencies({ listFeed }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ items: [feedPost], nextCursor: "next", hasMore: true, feedDate: "2026-09-25" });
    expect(listFeed).toHaveBeenCalledWith("user-viewer", fixedNow, 20, undefined);
  });

  it("forwards the cursor and limit", async () => {
    const listFeed = vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false, feedDate: "2026-09-25" }));
    await get(dependencies({ listFeed }), "?limit=5&cursor=abc");

    expect(listFeed).toHaveBeenCalledWith("user-viewer", fixedNow, 5, "abc");
  });

  it.each(["?limit=0", "?limit=101", "?limit=two"])("rejects %s", async (query) => {
    const listFeed = vi.fn();
    const response = await get(dependencies({ listFeed }), query);

    expect(response.status).toBe(422);
    expect(listFeed).not.toHaveBeenCalled();
  });

  it("rejects a cursor the repository cannot read", async () => {
    const response = await get(dependencies({
      listFeed: async () => { throw new InvalidFeedCursorError(); },
    }), "?cursor=not-a-cursor");

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "VALIDATION_FAILED", details: { field: "cursor" } } });
  });

  it("tells the client to start again when the cursor is from an earlier feed day", async () => {
    const response = await get(dependencies({
      listFeed: async () => { throw new StaleFeedCursorError("2026-09-26"); },
    }), "?cursor=yesterdays");

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "CONFLICT", details: { reason: "feedDayChanged", feedDate: "2026-09-26" } },
    });
  });

  it("conceals storage failures", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await get(dependencies({
      listFeed: async () => { throw new Error("relation \"posts\" does not exist"); },
    }));

    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).not.toContain("posts");
    expect(response.headers.get("cache-control")).toBe("no-store");
    error.mockRestore();
  });

  it("is unavailable when no repository is configured", async () => {
    const response = await get(dependencies());

    expect(response.status).toBe(503);
  });

  it("signs each item's media with one signature per object", async () => {
    const photo = (postId: string, order: number) => ({
      id: `${postId}-media-${order}`,
      postId,
      contentType: "image/jpeg" as const,
      order,
      objectKey: `media/user-friend/${postId}-${order}`,
    });
    const items: FeedPostRecord[] = [
      { ...feedPost, id: "post-1", media: [photo("post-1", 0), photo("post-1", 1)] },
      { ...feedPost, id: "post-2", media: [] },
    ];
    const sign = vi.fn(async (objectKey: string, now: Date) => ({
      url: `https://storage.example.test/${objectKey}?signature=abc`,
      expiresAt: new Date(now.getTime() + 300_000),
    }));
    const app = createApp({
      feed: dependencies({ listFeed: vi.fn(async () => ({ items, nextCursor: null, hasMore: false, feedDate: "2026-09-25" })) }, sign),
    });
    const response = await app.request("/api/v1/feed", { headers: { authorization: "Bearer user-viewer" } });
    const body = await response.json<{ items: Array<{ media: Array<{ url: string }> }> }>();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(sign).toHaveBeenCalledTimes(2);
    expect(body.items[0]?.media.map((media) => media.url)).toEqual([
      "https://storage.example.test/media/user-friend/post-1-0?signature=abc",
      "https://storage.example.test/media/user-friend/post-1-1?signature=abc",
    ]);
    expect(body.items[1]?.media).toEqual([]);
    expect(JSON.stringify(body)).not.toContain("objectKey");
  });

  it("is unavailable for a page with media when storage isn't configured", async () => {
    const withMedia: FeedPostRecord = {
      ...feedPost,
      media: [{ id: "m-1", postId: "post-1", contentType: "image/jpeg", order: 0, objectKey: "media/user-friend/r-1" }],
    };
    const app = createApp({
      feed: dependencies({ listFeed: vi.fn(async () => ({ items: [withMedia], nextCursor: null, hasMore: false, feedDate: "2026-09-25" })) }),
    });
    const response = await app.request("/api/v1/feed", { headers: { authorization: "Bearer user-viewer" } });

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).not.toContain("objectKey");
  });

  it("still serves a text-only page without storage", async () => {
    const app = createApp({ feed: dependencies({}) });
    const response = await app.request("/api/v1/feed", { headers: { authorization: "Bearer user-viewer" } });
    expect(response.status).toBe(200);
  });
});
