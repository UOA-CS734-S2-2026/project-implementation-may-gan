import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../app";
import { InvalidPostCursorError } from "../shared/post-page-cursor";
import type { ProfilePostRecord, ProfilePostsRepository } from "./list-profile-posts.repository";
import type { ListProfilePostsRouteDependencies } from "./list-profile-posts.route";

const fixedNow = new Date("2026-09-26T03:00:00.000Z");

const profilePost: ProfilePostRecord = {
  id: "post-1",
  author: { id: "user-friend", username: "friend", displayName: "Friend" },
  localDate: "2026-09-25",
  prompt: { id: "prompt-09-25", text: "What made you smile today?" },
  reflectiveAnswer: "Walked to the harbour.",
  caption: null,
  rating: 7,
  audience: "solo",
  acceptedAt: "2026-09-25T03:00:00.000Z",
  releasedAt: "2026-09-25T12:00:00.000Z",
  released: true,
  edited: false,
  media: [],
};

const archive = (
  items: ProfilePostRecord[] = [profilePost],
  accessTier: "authorized" | "public" = "authorized",
  nextCursor: string | null = null,
  hasMore = false,
) => ({ accessTier, items, nextCursor, hasMore });

function dependencies(repository?: Partial<ProfilePostsRepository>, signMediaDownload?: ListProfilePostsRouteDependencies["signMediaDownload"]): ListProfilePostsRouteDependencies {
  return {
    resolveSession: async (request) => {
      const header = request.headers.get("authorization");
      return header?.startsWith("Bearer user-") ? { userId: header.slice("Bearer ".length) } : null;
    },
    repository: repository
      ? { listProfilePosts: vi.fn(async () => archive()), ...repository }
      : undefined,
    now: () => fixedNow,
    signMediaDownload,
  };
}

function get(deps: ListProfilePostsRouteDependencies, path = "/api/v1/profiles/friend/posts", user: string | null = "user-viewer") {
  return createApp({ profilePosts: deps }).request(path, {
    headers: user ? { authorization: `Bearer ${user}` } : {},
  });
}

describe("GET /api/v1/profiles/{username}/posts", () => {
  it("allows an anonymous read and passes no actor identity", async () => {
    const listProfilePosts = vi.fn(async () => archive([profilePost], "public"));
    const response = await get(dependencies({ listProfilePosts }), undefined, null);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(listProfilePosts).toHaveBeenCalledWith(null, "friend", fixedNow, 20, undefined);
  });

  it("rejects invalid presented credentials instead of treating them as anonymous", async () => {
    const listProfilePosts = vi.fn();
    const response = await createApp({ profilePosts: dependencies({ listProfilePosts }) }).request(
      "/api/v1/profiles/friend/posts",
      { headers: { authorization: "Bearer invalid" } },
    );

    expect(response.status).toBe(401);
    expect(listProfilePosts).not.toHaveBeenCalled();
  });

  it("reads the page for the verified actor with the default page size and server time", async () => {
    const listProfilePosts = vi.fn(async () => archive([profilePost], "authorized", "next", true));
    const response = await get(dependencies({ listProfilePosts }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ kind: "archive", items: [profilePost], nextCursor: "next", hasMore: true });
    expect(listProfilePosts).toHaveBeenCalledWith("user-viewer", "friend", fixedNow, 20, undefined);
  });

  it("forwards the cursor and limit", async () => {
    const listProfilePosts = vi.fn(async () => archive([]));
    await get(dependencies({ listProfilePosts }), "/api/v1/profiles/friend/posts?limit=5&cursor=abc");

    expect(listProfilePosts).toHaveBeenCalledWith("user-viewer", "friend", fixedNow, 5, "abc");
  });

  it("returns a private non-friend only the username and restricted state", async () => {
    const response = await get(dependencies({
      listProfilePosts: async () => ({ kind: "restricted", username: "friend" }),
    }), undefined, null);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ kind: "restricted", username: "friend" });
  });

  it("is not found when the repository cannot resolve the profile", async () => {
    const response = await get(dependencies({ listProfilePosts: async () => null }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it.each([
    "/api/v1/profiles/friend/posts?limit=0",
    "/api/v1/profiles/friend/posts?limit=101",
    "/api/v1/profiles/no%20spaces/posts",
    "/api/v1/profiles/x/posts",
  ])("rejects %s", async (path) => {
    const listProfilePosts = vi.fn();
    const response = await get(dependencies({ listProfilePosts }), path);

    expect(response.status).toBe(422);
    expect(listProfilePosts).not.toHaveBeenCalled();
  });

  it("rejects a cursor the repository cannot read", async () => {
    const response = await get(dependencies({
      listProfilePosts: async () => { throw new InvalidPostCursorError(); },
    }), "/api/v1/profiles/friend/posts?cursor=not-a-cursor");

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "VALIDATION_FAILED", details: { field: "cursor" } } });
  });

  it("conceals storage failures", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await get(dependencies({
      listProfilePosts: async () => { throw new Error("relation \"posts\" does not exist"); },
    }));

    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("posts\"");
    error.mockRestore();
  });

  it.each(["user-owner", "user-friend"])("signs media for authorized viewer %s", async (viewer) => {
    const withMedia: ProfilePostRecord = {
      ...profilePost,
      media: [{ id: "m-1", postId: "post-1", contentType: "image/jpeg", order: 0, objectKey: "media/user-friend/r-1" }],
    };
    const sign = vi.fn(async (objectKey: string, now: Date) => ({
      url: `https://storage.example.test/${objectKey}?signature=abc`,
      expiresAt: new Date(now.getTime() + 300_000),
    }));
    const response = await get(dependencies({ listProfilePosts: async () => archive([withMedia]) }, sign), undefined, viewer);
    const body = await response.json<{ items: Array<{ media: Array<{ url: string }> }> }>();

    expect(response.status).toBe(200);
    expect(body.items[0]?.media.map((media) => media.url)).toEqual(["https://storage.example.test/media/user-friend/r-1?signature=abc"]);
    expect(JSON.stringify(body)).not.toContain("objectKey");
  });

  it.each([null, "user-stranger"])("returns Worker media URLs for a public-only archive as %s", async (viewer) => {
    const withMedia: ProfilePostRecord = {
      ...profilePost,
      media: [{ id: "m-1", postId: "post-1", contentType: "image/jpeg", order: 0, objectKey: "media/user-friend/r-1" }],
    };
    const sign = vi.fn(async () => ({ url: "https://storage.example.test/signed", expiresAt: fixedNow }));
    const response = await get(dependencies({
      listProfilePosts: async () => archive([withMedia], "public"),
    }, sign), undefined, viewer);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(sign).not.toHaveBeenCalled();
    const body = await response.json<{ items: Array<{ media: Array<{ url: string; expiresAt: string | null }> }> }>();
    expect(body.items[0]?.media[0]).toMatchObject({
      url: "http://localhost/api/v1/posts/post-1/media/m-1/content",
      expiresAt: null,
    });
    expect(JSON.stringify(body)).not.toContain("objectKey");
  });

  it("is unavailable for a page with media when storage isn't configured", async () => {
    const withMedia: ProfilePostRecord = {
      ...profilePost,
      media: [{ id: "m-1", postId: "post-1", contentType: "image/jpeg", order: 0, objectKey: "media/user-friend/r-1" }],
    };
    const response = await get(dependencies({ listProfilePosts: async () => archive([withMedia]) }));

    expect(response.status).toBe(503);
  });

  it("is unavailable when no repository is configured", async () => {
    const response = await get(dependencies());

    expect(response.status).toBe(503);
  });
});
