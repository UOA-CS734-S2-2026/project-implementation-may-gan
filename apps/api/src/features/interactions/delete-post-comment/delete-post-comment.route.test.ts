import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../app";
import type { DeletePostCommentRepository } from "./delete-post-comment.repository";
import type { DeletePostCommentRouteDependencies } from "./delete-post-comment.route";

const fixedNow = new Date("2026-09-26T03:00:00.000Z");

const resolveSession: DeletePostCommentRouteDependencies["resolveSession"] = async (request) => {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer user-") ? { userId: header.slice("Bearer ".length) } : null;
};

function remove(repo: DeletePostCommentRepository | undefined, user: string | null = "user-author") {
  return createApp({ interactions: { deleteComment: { resolveSession, now: () => fixedNow, repository: repo } } })
    .request("/api/v1/posts/post-1/comments/comment-1", {
      method: "DELETE",
      headers: user ? { authorization: `Bearer ${user}` } : {},
    });
}

describe("DELETE /api/v1/posts/{postId}/comments/{commentId}", () => {
  it("requires a session", async () => {
    const repo = { deleteComment: vi.fn(async () => true) };
    expect((await remove(repo, null)).status).toBe(401);
    expect(repo.deleteComment).not.toHaveBeenCalled();
  });

  it("deletes for the verified actor with no body", async () => {
    const repo = { deleteComment: vi.fn(async () => true) };
    const response = await remove(repo);

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(repo.deleteComment).toHaveBeenCalledWith("user-author", "post-1", "comment-1", fixedNow);
  });

  it("conceals a comment the actor may not delete as 404", async () => {
    expect((await remove({ deleteComment: async () => false })).status).toBe(404);
  });

  it("is unavailable without storage", async () => {
    expect((await remove(undefined)).status).toBe(503);
  });
});
