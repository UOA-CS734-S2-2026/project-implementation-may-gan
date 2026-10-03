import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../app";
import type { PostDetailRecord, PostDetailRepository } from "../shared/post-detail.repository";
import type { GetPostRouteDependencies } from "./get-post.route";

const fixedNow = new Date("2026-09-26T03:00:00.000Z");

const detail: PostDetailRecord = {
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
  revisionCount: 0,
  likeCount: 0,
  viewerHasLiked: false,
  commentCount: 0,
  viewerIsAuthor: false,
  media: [],
  voiceMemo: null,
  publicMediaDelivery: false,
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
  it("reads a public post anonymously without resolving a session", async () => {
    const repo = repository(async () => detail);
    const resolver = vi.fn(async () => { throw new Error("must not resolve"); });
    const response = await get({ repository: repo, resolveSession: resolver }, undefined, null);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(repo.findPost).toHaveBeenCalledWith(null, "post-1", fixedNow);
    expect(resolver).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ id: "post-1" }));
  });

  it("rejects invalid credentials instead of treating them as anonymous", async () => {
    const repo = repository(async () => detail);
    const response = await createApp({ postDetail: { resolveSession, repository: repo } }).request("/api/v1/posts/post-1", {
      headers: { authorization: "Bearer invalid" },
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(repo.findPost).not.toHaveBeenCalled();
  });

  it("returns a sanitized 503 when credential resolution fails", async () => {
    const repo = repository(async () => detail);
    const response = await createApp({
      postDetail: { resolveSession: async () => { throw new Error("auth database unavailable"); }, repository: repo },
    }).request("/api/v1/posts/post-1", { headers: { authorization: "Bearer valid" } });

    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("database unavailable");
    expect(repo.findPost).not.toHaveBeenCalled();
  });

  it("returns a readable post for the verified actor at server time", async () => {
    const repo = repository(async () => detail);
    const response = await get({ repository: repo });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { publicMediaDelivery, ...expected } = detail;
    expect(publicMediaDelivery).toBe(false);
    await expect(response.json()).resolves.toEqual(expected);
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

  it("documents voiceMemo as a required union with null, and keeps the shared components non-null", async () => {
    type Branch = { $ref?: string; type?: string; nullable?: boolean };
    type Schema = { nullable?: boolean; required?: string[]; properties?: Record<string, { anyOf?: Branch[] }> };
    const document = await (await createApp().request("/api/v1/openapi.json")).json<{
      components: { schemas: Record<string, Schema> };
    }>();
    const { schemas } = document.components;

    // The document is OpenAPI 3.1, whose generators read nullability from a union with
    // `null` and ignore the 3.0 `nullable: true`. Without it they generate a required,
    // non-null field and fail to decode `voiceMemo: null`, which every post without a memo sends.
    const expected = { PostDetail: "PostVoiceMemo", DailyPost: "DailyPostVoiceMemo" };
    for (const [name, component] of Object.entries(expected)) {
      const property = schemas[name]?.properties?.voiceMemo;
      expect(property?.anyOf, name).toEqual([{ $ref: `#/components/schemas/${component}` }, { type: "null" }]);
      // A bare `{ nullable: true }` branch would match anything in 3.1.
      expect(property?.anyOf?.some((branch) => branch.nullable), name).toBeFalsy();
      expect(schemas[name]?.required, name).toContain("voiceMemo");
      // The shared component, which the refresh route returns, stays a plain object.
      expect(schemas[component]?.nullable, component).toBeUndefined();
    }
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

  describe("media", () => {
    const withMedia: PostDetailRecord = {
      ...detail,
      media: [
        { id: "media-1", postId: "post-1", contentType: "image/jpeg", order: 0, objectKey: "media/user-friend/reservation-1" },
        { id: "media-2", postId: "post-1", contentType: "image/png", order: 1, objectKey: "media/user-friend/reservation-2" },
      ],
    };

    it("signs each attachment for this response and never exposes object keys", async () => {
      const sign = vi.fn(async (objectKey: string, now: Date) => ({
        url: `https://storage.example.test/${objectKey}?signature=abc`,
        expiresAt: new Date(now.getTime() + 300_000),
      }));
      const response = await get({ repository: repository(async () => withMedia), signMediaDownload: sign });
      const body = await response.json<{ media: unknown[] }>();

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(body.media).toEqual([
        {
          id: "media-1",
          contentType: "image/jpeg",
          order: 0,
          url: "https://storage.example.test/media/user-friend/reservation-1?signature=abc",
          expiresAt: "2026-09-26T03:05:00.000Z",
        },
        {
          id: "media-2",
          contentType: "image/png",
          order: 1,
          url: "https://storage.example.test/media/user-friend/reservation-2?signature=abc",
          expiresAt: "2026-09-26T03:05:00.000Z",
        },
      ]);
      expect(sign).toHaveBeenCalledWith("media/user-friend/reservation-1", fixedNow);
      expect(JSON.stringify(body.media)).not.toContain("objectKey");
      expect(JSON.stringify(body.media)).not.toContain("postId");
    });

    it("returns parent-authorized Worker URLs through public-profile-only access", async () => {
      const sign = vi.fn();
      const response = await get({
        repository: repository(async () => ({ ...withMedia, publicMediaDelivery: true })),
        signMediaDownload: sign,
      }, undefined, null);
      const body = await response.json<{ media: Array<{ url: string; expiresAt: string | null }> }>();

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(body.media[0]).toEqual({
        id: "media-1",
        contentType: "image/jpeg",
        order: 0,
        url: "http://localhost/api/v1/posts/post-1/media/media-1/content",
        expiresAt: null,
      });
      expect(sign).not.toHaveBeenCalled();
      expect(JSON.stringify(body)).not.toContain("objectKey");
    });

    it("is unavailable for a post with media when storage isn't configured", async () => {
      const response = await get({ repository: repository(async () => withMedia) });

      // Never a media response without URLs: url and expiresAt are always set.
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toMatchObject({ error: { code: "SERVICE_UNAVAILABLE" } });
    });

    it("still serves a text-only post without storage", async () => {
      const response = await get({ repository: repository(async () => detail) });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ media: [] });
    });

    describe("voice memo", () => {
      const withRecording: PostDetailRecord = {
        ...detail,
        voiceMemo: {
          id: "media-9",
          postId: "post-1",
          contentType: "audio/mp4",
          objectKey: "media/user-friend/reservation-9",
        },
      };
      const sign = vi.fn(async (objectKey: string, now: Date) => ({
        url: `https://storage.example.test/${objectKey}?signature=abc`,
        expiresAt: new Date(now.getTime() + 300_000),
      }));

      it("signs the voice memo for this response and never exposes the object key", async () => {
        const response = await get({ repository: repository(async () => withRecording), signMediaDownload: sign });
        const body = await response.json<{ media: unknown[]; voiceMemo: unknown }>();

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(body.media).toEqual([]);
        expect(body.voiceMemo).toEqual({
          id: "media-9",
          contentType: "audio/mp4",
          url: "https://storage.example.test/media/user-friend/reservation-9?signature=abc",
          expiresAt: "2026-09-26T03:05:00.000Z",
        });
        expect(JSON.stringify(body)).not.toContain("objectKey");
      });

      it("returns a parent-authorized Worker URL for a public voice memo", async () => {
        const response = await get({
          repository: repository(async () => ({ ...withRecording, publicMediaDelivery: true })),
          signMediaDownload: sign,
        }, undefined, null);
        const body = await response.json<{ voiceMemo: { url: string; expiresAt: string | null } }>();

        expect(response.status).toBe(200);
        expect(body.voiceMemo).toEqual({
          id: "media-9",
          contentType: "audio/mp4",
          url: "http://localhost/api/v1/posts/post-1/voice-memo/content",
          expiresAt: null,
        });
      });

      it("is unavailable for a post with a voice memo when storage isn't configured", async () => {
        const response = await get({ repository: repository(async () => withRecording) });

        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toMatchObject({ error: { code: "SERVICE_UNAVAILABLE" } });
      });
    });

    it("signs nothing for a post the viewer can't read", async () => {
      const sign = vi.fn();
      const response = await get({ repository: repository(async () => null), signMediaDownload: sign });
      expect(response.status).toBe(404);
      expect(sign).not.toHaveBeenCalled();
    });
  });
});
