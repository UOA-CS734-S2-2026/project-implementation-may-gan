import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../app";
import type { PostComment } from "../shared/interactions.contract";
import type { CreatePostCommentOutcome, CreatePostCommentRepository } from "./create-post-comment.repository";
import type { CreatePostCommentRouteDependencies } from "./create-post-comment.route";

const fixedNow = new Date("2026-09-26T03:00:00.000Z");
const comment: PostComment = {
  id: "comment-1",
  postId: "post-1",
  parentCommentId: null,
  author: { id: "user-friend", username: "friend", displayName: "Friend" },
  text: "What a view!",
  createdAt: "2026-09-26T03:00:00.000Z",
  editedAt: null,
  viewerCanEdit: true,
  viewerCanDelete: true,
};

const resolveSession: CreatePostCommentRouteDependencies["resolveSession"] = async (request) => {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer user-") ? { userId: header.slice("Bearer ".length) } : null;
};

function repository(outcome: CreatePostCommentOutcome): CreatePostCommentRepository {
  return { createComment: vi.fn(async () => outcome) };
}

function post(repo: CreatePostCommentRepository | undefined, body: unknown, user: string | null = "user-friend") {
  return createApp({ interactions: { createComment: { resolveSession, now: () => fixedNow, repository: repo } } })
    .request("/api/v1/posts/post-1/comments", {
      method: "POST",
      headers: { "content-type": "application/json", ...(user ? { authorization: `Bearer ${user}` } : {}) },
      body: JSON.stringify(body),
    });
}

const valid = { clientCommentId: "c-1", text: "What a view!" };

describe("POST /api/v1/posts/{postId}/comments", () => {
  it("requires a session", async () => {
    const repo = repository({ kind: "created", comment });
    const response = await post(repo, valid, null);

    expect(response.status).toBe(401);
    expect(repo.createComment).not.toHaveBeenCalled();
  });

  it("creates a comment for the verified actor", async () => {
    const repo = repository({ kind: "created", comment });
    const response = await post(repo, { ...valid, parentCommentId: "comment-0" });

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(comment);
    expect(repo.createComment).toHaveBeenCalledWith("user-friend", "post-1", { ...valid, parentCommentId: "comment-0" }, fixedNow);
  });

  it("accepts a null parent for a top-level comment", async () => {
    const repo = repository({ kind: "created", comment });
    const response = await post(repo, { ...valid, parentCommentId: null });

    expect(response.status).toBe(201);
    expect(repo.createComment).toHaveBeenCalledWith("user-friend", "post-1", { ...valid, parentCommentId: null }, fixedNow);
  });

  it("returns 200 with the existing comment for a retry", async () => {
    const response = await post(repository({ kind: "replayed", comment }), valid);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(comment);
  });

  it.each([
    ["not_found", 404, "NOT_FOUND"],
    ["invalid_parent", 422, "VALIDATION_FAILED"],
    ["conflict", 409, "CONFLICT"],
  ] as const)("maps %s to %i", async (kind, status, code) => {
    const response = await post(repository({ kind }), valid);

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ error: { code } });
  });

  it.each([
    ["blank text", { ...valid, text: "   " }],
    ["untrimmed text", { ...valid, text: " hi " }],
    ["text over 1000 characters", { ...valid, text: "a".repeat(1001) }],
    ["a missing client ID", { text: "hi" }],
    ["an unknown field", { ...valid, likes: 3 }],
  ])("rejects %s", async (_, body) => {
    const repo = repository({ kind: "created", comment });
    const response = await post(repo, body);

    expect(response.status).toBe(422);
    expect(repo.createComment).not.toHaveBeenCalled();
  });

  it("conceals storage failures and is unavailable without storage", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = await post({ createComment: async () => { throw new Error("relation \"post_comments\" does not exist"); } }, valid);
    const missing = await post(undefined, valid);

    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("post_comments");
    expect(missing.status).toBe(503);
    error.mockRestore();
  });
});
