import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../../app";
import { InvalidInteractionCursorError } from "../../shared/interaction-cursor";
import type { PostCommentsPage } from "../list-post-comments.contract";
import type { PostCommentsRepository } from "../list-post-comments.repository";
import type { ListPostCommentsRouteDependencies } from "../list-post-comments.route";

const fixedNow = new Date("2026-09-26T03:00:00.000Z");
const page: PostCommentsPage = {
  items: [{
    id: "comment-1",
    postId: "post-1",
    parentCommentId: null,
    author: { id: "user-ana", username: "ana", displayName: "Ana" },
    text: "What a view!",
    createdAt: "2026-09-25T10:00:00.000Z",
    editedAt: null,
    viewerCanEdit: false,
    viewerCanDelete: false,
  }],
  nextCursor: null,
  hasMore: false,
};

const resolveSession: ListPostCommentsRouteDependencies["resolveSession"] = async (request) => {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer user-") ? { userId: header.slice("Bearer ".length) } : null;
};

function get(repo?: PostCommentsRepository, path = "/api/v1/posts/post-1/comments", user: string | null = "user-friend") {
  return createApp({ interactions: { comments: { resolveSession, now: () => fixedNow, repository: repo } } }).request(path, {
    headers: user ? { authorization: `Bearer ${user}` } : {},
  });
}

describe("GET /api/v1/posts/{postId}/comments", () => {
  it("requires a session", async () => {
    const repo = { listComments: vi.fn(async () => page) };
    const response = await get(repo, undefined, null);

    expect(response.status).toBe(401);
    expect(repo.listComments).not.toHaveBeenCalled();
  });

  it("returns a page for the verified actor, passing the cursor and limit", async () => {
    const repo = { listComments: vi.fn(async () => page) };
    const response = await get(repo, "/api/v1/posts/post-1/comments?limit=5&cursor=abc");

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(page);
    expect(repo.listComments).toHaveBeenCalledWith("user-friend", "post-1", fixedNow, 5, "abc");
  });

  it("conceals an unreadable post and rejects a bad cursor", async () => {
    const hidden = await get({ listComments: async () => null });
    const badCursor = await get({ listComments: async () => { throw new InvalidInteractionCursorError(); } });

    expect(hidden.status).toBe(404);
    expect(badCursor.status).toBe(422);
    await expect(badCursor.json()).resolves.toMatchObject({ error: { details: { field: "cursor" } } });
  });

  it("is unavailable without storage", async () => {
    expect((await get()).status).toBe(503);
  });
});
