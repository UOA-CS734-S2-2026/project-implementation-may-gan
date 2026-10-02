import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../app";
import type { PostLikeRepository } from "../shared/post-like.repository";
import type { LikePostRouteDependencies } from "./like-post.route";

const fixedNow = new Date("2026-09-26T03:00:00.000Z");

const resolveSession: LikePostRouteDependencies["resolveSession"] = async (request) => {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer user-") ? { userId: header.slice("Bearer ".length) } : null;
};

function repository(setLike: PostLikeRepository["setLike"]): PostLikeRepository {
  return { setLike: vi.fn(setLike) };
}

function send(method: "PUT" | "DELETE", repo?: PostLikeRepository, user: string | null = "user-friend", path = "/api/v1/posts/post-1/like") {
  const deps = { resolveSession, now: () => fixedNow, repository: repo };
  return createApp({ interactions: { like: deps, unlike: deps } }).request(path, {
    method,
    headers: user ? { authorization: `Bearer ${user}` } : {},
  });
}

describe("PUT and DELETE /api/v1/posts/{postId}/like", () => {
  it("requires a session and never changes a like", async () => {
    const repo = repository(async () => ({ likeCount: 1, viewerHasLiked: true }));
    const response = await send("PUT", repo, null);

    expect(response.status).toBe(401);
    expect(repo.setLike).not.toHaveBeenCalled();
  });

  it.each([
    ["PUT", true],
    ["DELETE", false],
  ] as const)("%s sets the verified actor's like and returns the summary", async (method, liked) => {
    const summary = { likeCount: liked ? 3 : 2, viewerHasLiked: liked };
    const repo = repository(async () => summary);
    const response = await send(method, repo);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(summary);
    expect(repo.setLike).toHaveBeenCalledWith("user-friend", "post-1", liked, fixedNow);
  });

  it("conceals a post the actor may not read as 404", async () => {
    const response = await send("PUT", repository(async () => null));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("rejects an overlong post ID", async () => {
    const repo = repository(async () => null);
    const response = await send("PUT", repo, "user-friend", `/api/v1/posts/${"x".repeat(129)}/like`);

    expect(response.status).toBe(422);
    expect(repo.setLike).not.toHaveBeenCalled();
  });

  it("conceals storage failures and is unavailable without storage", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = await send("DELETE", repository(async () => { throw new Error("relation \"post_likes\" does not exist"); }));
    const missing = await send("PUT");

    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("post_likes");
    expect(missing.status).toBe(503);
    error.mockRestore();
  });
});
