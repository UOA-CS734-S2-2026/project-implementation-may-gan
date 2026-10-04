import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../../app";
import type { PostRevisionsPage } from "../list-post-revisions.contract";
import { InvalidRevisionCursorError, type PostRevisionsRepository } from "../list-post-revisions.repository";
import type { ListPostRevisionsRouteDependencies } from "../list-post-revisions.route";

const fixedNow = new Date("2026-09-26T03:00:00.000Z");

const page: PostRevisionsPage = {
  items: [{
    revisionNumber: 1,
    reflectiveAnswer: "Walked to the harbour.",
    caption: "Sunset",
    rating: 7,
    audience: "friends",
    replacedAt: "2026-09-25T20:00:00.000Z",
  }],
  nextCursor: null,
  hasMore: false,
};

const resolveSession: ListPostRevisionsRouteDependencies["resolveSession"] = async (request) => {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer user-") ? { userId: header.slice("Bearer ".length) } : null;
};

function repository(listRevisions: PostRevisionsRepository["listRevisions"]): PostRevisionsRepository {
  return { listRevisions: vi.fn(listRevisions) };
}

function get(deps: Partial<ListPostRevisionsRouteDependencies>, path = "/api/v1/posts/post-1/revisions", user: string | null = "user-friend") {
  return createApp({ postRevisions: { resolveSession, now: () => fixedNow, ...deps } }).request(path, {
    headers: user ? { authorization: `Bearer ${user}` } : {},
  });
}

describe("GET /api/v1/posts/{postId}/revisions", () => {
  it("requires a session and never reads the history", async () => {
    const repo = repository(async () => page);
    const response = await get({ repository: repo }, undefined, null);

    expect(response.status).toBe(401);
    expect(repo.listRevisions).not.toHaveBeenCalled();
  });

  it("returns one page for the verified actor with the default page size", async () => {
    const repo = repository(async () => page);
    const response = await get({ repository: repo });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(page);
    expect(repo.listRevisions).toHaveBeenCalledWith("user-friend", "post-1", fixedNow, 20, undefined);
  });

  it("passes the cursor and limit through", async () => {
    const repo = repository(async () => page);
    await get({ repository: repo }, "/api/v1/posts/post-1/revisions?limit=5&cursor=abc");

    expect(repo.listRevisions).toHaveBeenCalledWith("user-friend", "post-1", fixedNow, 5, "abc");
  });

  it("conceals a missing or unreadable post as 404", async () => {
    const response = await get({ repository: repository(async () => null) });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("rejects an unrecognised cursor", async () => {
    const response = await get({ repository: repository(async () => { throw new InvalidRevisionCursorError(); }) });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "VALIDATION_FAILED", details: { field: "cursor" } } });
  });

  it("conceals storage failures", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await get({ repository: repository(async () => { throw new Error("relation \"post_revisions\" does not exist"); }) });

    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("post_revisions");
    error.mockRestore();
  });

  it("is unavailable when no repository is configured", async () => {
    const response = await get({});

    expect(response.status).toBe(503);
  });
});
