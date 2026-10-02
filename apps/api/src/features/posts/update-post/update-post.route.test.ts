import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../app";
import type { PostDetailRecord, PostDetailRepository } from "../shared/post-detail.repository";
import type { UpdatePostRepository } from "./update-post.repository";
import type { UpdatePostRouteDependencies } from "./update-post.route";

const fixedNow = new Date("2026-09-26T03:00:00.000Z");

const detail: PostDetailRecord = {
  id: "post-1",
  author: { id: "user-author", username: "author", displayName: "Author" },
  localDate: "2026-09-25",
  prompt: { id: "prompt-09-25", text: "What made you smile today?" },
  reflectiveAnswer: "Walked to the harbour and back.",
  caption: null,
  rating: 8,
  audience: "friends",
  acceptedAt: "2026-09-25T03:00:00.000Z",
  releasedAt: "2026-09-25T12:00:00.000Z",
  edited: true,
  revisionCount: 1,
  viewerIsAuthor: true,
  media: [],
  voiceMemo: null,
};

const resolveSession: UpdatePostRouteDependencies["resolveSession"] = async (request) => {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer user-") ? { userId: header.slice("Bearer ".length) } : null;
};

function repository(outcome: Awaited<ReturnType<UpdatePostRepository["updatePost"]>>): UpdatePostRepository {
  return { updatePost: vi.fn(async () => outcome) };
}

function detailRepository(post: PostDetailRecord | null = detail): PostDetailRepository {
  return { findPost: vi.fn(async () => post) };
}

function patch(deps: Partial<UpdatePostRouteDependencies>, body: unknown, user: string | null = "user-author") {
  return createApp({ postUpdate: { resolveSession, now: () => fixedNow, ...deps } }).request("/api/v1/posts/post-1", {
    method: "PATCH",
    headers: { "content-type": "application/json", ...(user ? { authorization: `Bearer ${user}` } : {}) },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/v1/posts/{postId}", () => {
  it("requires a session and never edits the post", async () => {
    const repo = repository("updated");
    const response = await patch({ repository: repo, detail: detailRepository() }, { expectedRevisionCount: 0, rating: 8 }, null);

    expect(response.status).toBe(401);
    expect(repo.updatePost).not.toHaveBeenCalled();
  });

  it("saves the edit for the verified author and returns the post", async () => {
    const repo = repository("updated");
    const details = detailRepository();
    const response = await patch(
      { repository: repo, detail: details },
      { expectedRevisionCount: 0, reflectiveAnswer: "Walked to the harbour and back.", caption: null, rating: 8 },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(detail);
    expect(repo.updatePost).toHaveBeenCalledWith(
      "user-author",
      "post-1",
      0,
      { reflectiveAnswer: "Walked to the harbour and back.", caption: null, rating: 8 },
      fixedNow,
    );
    expect(details.findPost).toHaveBeenCalledWith("user-author", "post-1", fixedNow);
  });

  it("returns the post when the edit was already saved", async () => {
    const response = await patch({ repository: repository("unchanged"), detail: detailRepository() }, { expectedRevisionCount: 0, rating: 8 });

    expect(response.status).toBe(200);
  });

  it("reports a stale revision count as a conflict", async () => {
    const response = await patch({ repository: repository("conflict"), detail: detailRepository() }, { expectedRevisionCount: 0, rating: 8 });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "CONFLICT" } });
  });

  it("conceals someone else's or a deleted post as 404", async () => {
    const response = await patch({ repository: repository("not_found"), detail: detailRepository() }, { expectedRevisionCount: 0, rating: 8 });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it.each([
    ["no change", { expectedRevisionCount: 0 }],
    ["a missing revision count", { rating: 8 }],
    ["a blank answer", { expectedRevisionCount: 0, reflectiveAnswer: "  " }],
    ["a rating out of range", { expectedRevisionCount: 0, rating: 11 }],
    ["an unknown audience", { expectedRevisionCount: 0, audience: "public" }],
    ["a field that can't be edited", { expectedRevisionCount: 0, localDate: "2026-09-24" }],
  ])("rejects %s", async (_, body) => {
    const repo = repository("updated");
    const response = await patch({ repository: repo, detail: detailRepository() }, body);

    expect(response.status).toBe(422);
    expect(repo.updatePost).not.toHaveBeenCalled();
  });

  it("conceals storage failures", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const repo: UpdatePostRepository = { updatePost: async () => { throw new Error("relation \"posts\" does not exist"); } };
    const response = await patch({ repository: repo, detail: detailRepository() }, { expectedRevisionCount: 0, rating: 8 });

    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("posts\"");
    error.mockRestore();
  });

  it("is unavailable when no repository is configured", async () => {
    const response = await patch({}, { expectedRevisionCount: 0, rating: 8 });

    expect(response.status).toBe(503);
  });

  it("does not add a second session check to reading the post", async () => {
    const editSession = vi.fn(resolveSession);
    const response = await createApp({ postUpdate: { resolveSession: editSession } }).request("/api/v1/posts/post-1", {
      headers: { authorization: "Bearer user-author" },
    });

    expect(response.status).toBe(401);
    expect(editSession).not.toHaveBeenCalled();
  });
});
