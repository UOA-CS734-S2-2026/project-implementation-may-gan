import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../../app";
import { InvalidInteractionCursorError } from "../../shared/interaction-cursor";
import type { PostLikesPage } from "../list-post-likes.contract";
import type { PostLikesRepository } from "../list-post-likes.repository";
import type { ListPostLikesRouteDependencies } from "../list-post-likes.route";

const fixedNow = new Date("2026-09-26T03:00:00.000Z");
const page: PostLikesPage = {
  items: [{ person: { id: "user-ana", username: "ana", displayName: "Ana" }, likedAt: "2026-09-25T10:00:00.000Z" }],
  nextCursor: null,
  hasMore: false,
};

const resolveSession: ListPostLikesRouteDependencies["resolveSession"] = async (request) => {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer user-") ? { userId: header.slice("Bearer ".length) } : null;
};

function get(repo?: PostLikesRepository, path = "/api/v1/posts/post-1/likes", user: string | null = "user-friend") {
  return createApp({ interactions: { likes: { resolveSession, now: () => fixedNow, repository: repo } } }).request(path, {
    headers: user ? { authorization: `Bearer ${user}` } : {},
  });
}

describe("GET /api/v1/posts/{postId}/likes", () => {
  it("requires a session", async () => {
    const repo = { listLikes: vi.fn(async () => page) };
    const response = await get(repo, undefined, null);

    expect(response.status).toBe(401);
    expect(repo.listLikes).not.toHaveBeenCalled();
  });

  it("returns a page for the verified actor, passing the cursor and limit", async () => {
    const repo = { listLikes: vi.fn(async () => page) };
    const response = await get(repo, "/api/v1/posts/post-1/likes?limit=5&cursor=abc");

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(page);
    expect(repo.listLikes).toHaveBeenCalledWith("user-friend", "post-1", fixedNow, 5, "abc");
  });

  it("conceals an unreadable post and rejects a bad cursor", async () => {
    const hidden = await get({ listLikes: async () => null });
    const badCursor = await get({ listLikes: async () => { throw new InvalidInteractionCursorError(); } });

    expect(hidden.status).toBe(404);
    expect(badCursor.status).toBe(422);
    await expect(badCursor.json()).resolves.toMatchObject({ error: { details: { field: "cursor" } } });
  });

  it("is unavailable without storage", async () => {
    expect((await get()).status).toBe(503);
  });
});
