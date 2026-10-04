import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../../app";
import type { PostComment } from "../../shared/interactions.contract";
import type { UpdatePostCommentRepository } from "../update-post-comment.repository";
import type { UpdatePostCommentRouteDependencies } from "../update-post-comment.route";

const fixedNow = new Date("2026-09-26T03:00:00.000Z");
const comment: PostComment = {
  id: "comment-1",
  postId: "post-1",
  parentCommentId: null,
  author: { id: "user-friend", username: "friend", displayName: "Friend" },
  text: "Edited",
  createdAt: "2026-09-26T02:00:00.000Z",
  editedAt: "2026-09-26T03:00:00.000Z",
  viewerCanEdit: true,
  viewerCanDelete: true,
};

const resolveSession: UpdatePostCommentRouteDependencies["resolveSession"] = async (request) => {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer user-") ? { userId: header.slice("Bearer ".length) } : null;
};

function patch(repo: UpdatePostCommentRepository | undefined, body: unknown, user: string | null = "user-friend") {
  return createApp({ interactions: { updateComment: { resolveSession, now: () => fixedNow, repository: repo } } })
    .request("/api/v1/posts/post-1/comments/comment-1", {
      method: "PATCH",
      headers: { "content-type": "application/json", ...(user ? { authorization: `Bearer ${user}` } : {}) },
      body: JSON.stringify(body),
    });
}

describe("PATCH /api/v1/posts/{postId}/comments/{commentId}", () => {
  it("requires a session", async () => {
    const repo = { updateComment: vi.fn(async () => comment) };
    expect((await patch(repo, { text: "Edited" }, null)).status).toBe(401);
    expect(repo.updateComment).not.toHaveBeenCalled();
  });

  it("saves the commenter's edit", async () => {
    const repo = { updateComment: vi.fn(async () => comment) };
    const response = await patch(repo, { text: "Edited" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(comment);
    expect(repo.updateComment).toHaveBeenCalledWith("user-friend", "post-1", "comment-1", "Edited", fixedNow);
  });

  it("conceals someone else's or a hidden comment as 404", async () => {
    expect((await patch({ updateComment: async () => null }, { text: "Edited" })).status).toBe(404);
  });

  it("conceals a reply under a deleted or blocked parent as 404 without a comment in the response", async () => {
    // The repository can't tell the route why it returned null, so neither can the response.
    const repo = { updateComment: vi.fn(async () => null) };
    const response = await patch(repo, { text: "Edited" });

    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("Edited");
  });

  it("rejects blank text", async () => {
    const repo = { updateComment: vi.fn(async () => comment) };
    expect((await patch(repo, { text: "" })).status).toBe(422);
    expect(repo.updateComment).not.toHaveBeenCalled();
  });

  it("is unavailable without storage", async () => {
    expect((await patch(undefined, { text: "Edited" })).status).toBe(503);
  });
});
