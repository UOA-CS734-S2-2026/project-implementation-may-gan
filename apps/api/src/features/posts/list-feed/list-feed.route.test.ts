import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../app";
import type { FeedPost } from "./list-feed.contract";
import { InvalidFeedCursorError, type FeedRepository } from "./list-feed.repository";
import type { ListFeedRouteDependencies } from "./list-feed.route";

const fixedNow = new Date("2026-09-26T03:00:00.000Z");

const feedPost: FeedPost = {
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
};

function dependencies(repository?: Partial<FeedRepository>): ListFeedRouteDependencies {
  return {
    resolveSession: async (request) => {
      const header = request.headers.get("authorization");
      return header?.startsWith("Bearer user-") ? { userId: header.slice("Bearer ".length) } : null;
    },
    repository: repository
      ? { listFeed: vi.fn(async () => ({ items: [feedPost], nextCursor: null, hasMore: false })), ...repository }
      : undefined,
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
    const listFeed = vi.fn(async () => ({ items: [feedPost], nextCursor: "next", hasMore: true }));
    const response = await get(dependencies({ listFeed }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ items: [feedPost], nextCursor: "next", hasMore: true });
    expect(listFeed).toHaveBeenCalledWith("user-viewer", fixedNow, 20, undefined);
  });

  it("forwards the cursor and limit", async () => {
    const listFeed = vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false }));
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
});
