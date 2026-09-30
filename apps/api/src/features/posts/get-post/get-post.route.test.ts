import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../app";
import type { PostDetail } from "./get-post.contract";
import type { PostDetailRepository } from "./get-post.repository";
import type { GetPostRouteDependencies } from "./get-post.route";

const fixedNow = new Date("2026-09-26T03:00:00.000Z");

const detail: PostDetail = {
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
});
