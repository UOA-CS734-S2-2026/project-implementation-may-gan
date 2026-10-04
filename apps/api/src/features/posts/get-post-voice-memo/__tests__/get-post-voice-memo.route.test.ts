import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../../app";
import type { PostVoiceMemoRef } from "../../shared/post-media";
import type { PostVoiceMemoRepository } from "../get-post-voice-memo.repository";
import type { GetPostVoiceMemoRouteDependencies } from "../get-post-voice-memo.route";

const fixedNow = new Date("2026-09-26T03:00:00.000Z");
const path = "/api/v1/posts/post-1/voice-memo";

const voiceMemo: PostVoiceMemoRef = {
  id: "media-9",
  postId: "post-1",
  contentType: "audio/mp4",
  objectKey: "media/user-friend/reservation-9",
};

const resolveSession: GetPostVoiceMemoRouteDependencies["resolveSession"] = async (request) => {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer user-") ? { userId: header.slice("Bearer ".length) } : null;
};

const sign = vi.fn(async (objectKey: string, now: Date) => ({
  url: `https://storage.example.test/${objectKey}?X-Amz-Signature=secret`,
  expiresAt: new Date(now.getTime() + 300_000),
}));

function repository(findVoiceMemo: PostVoiceMemoRepository["findVoiceMemo"]): PostVoiceMemoRepository {
  return { findVoiceMemo: vi.fn(findVoiceMemo) };
}

function get(deps: Partial<GetPostVoiceMemoRouteDependencies>, url = path, user: string | null = "user-viewer") {
  return createApp({
    postVoiceMemo: { resolveSession, now: () => fixedNow, signMediaDownload: sign, ...deps },
  }).request(url, { headers: user ? { authorization: `Bearer ${user}` } : {} });
}

describe("GET /api/v1/posts/{postId}/voice-memo", () => {
  it("requires a session and never looks the voice memo up", async () => {
    const repo = repository(async () => voiceMemo);
    const response = await get({ repository: repo }, path, null);

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(repo.findVoiceMemo).not.toHaveBeenCalled();
  });

  it("returns a fresh 5-minute URL for a readable, attached voice memo", async () => {
    const repo = repository(async () => voiceMemo);
    const response = await get({ repository: repo });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      id: "media-9",
      contentType: "audio/mp4",
      url: "https://storage.example.test/media/user-friend/reservation-9?X-Amz-Signature=secret",
      expiresAt: "2026-09-26T03:05:00.000Z",
    });
    expect(repo.findVoiceMemo).toHaveBeenCalledWith("user-viewer", "post-1", fixedNow);
  });

  it("conceals a missing, detached, or unreadable voice memo as one 404 and signs nothing", async () => {
    sign.mockClear();
    const response = await get({ repository: repository(async () => null) });

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "NOT_FOUND", message: "The voice memo was not found." },
    });
    expect(sign).not.toHaveBeenCalled();
  });

  it("is unavailable without media storage rather than returning a null URL", async () => {
    const repo = repository(async () => voiceMemo);
    const response = await get({ repository: repo, signMediaDownload: undefined });

    expect(response.status).toBe(503);
    expect(repo.findVoiceMemo).not.toHaveBeenCalled();
  });

  it("rejects an overlong post ID before any lookup", async () => {
    const repo = repository(async () => voiceMemo);
    const response = await get({ repository: repo }, `/api/v1/posts/${"x".repeat(129)}/voice-memo`);

    expect(response.status).toBe(422);
    expect(repo.findVoiceMemo).not.toHaveBeenCalled();
  });

  it("keeps storage details and signed URLs out of errors and logs", async () => {
    const logged: unknown[] = [];
    const error = vi.spyOn(console, "error").mockImplementation((...args) => { logged.push(...args); });
    const failingSign = vi.fn(async () => {
      throw new Error("failed to sign media/user-friend/reservation-9?X-Amz-Signature=secret");
    });
    const response = await get({ repository: repository(async () => voiceMemo), signMediaDownload: failingSign });
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).not.toContain("reservation-9");
    expect(JSON.stringify(logged)).not.toContain("reservation-9");
    expect(JSON.stringify(logged)).not.toContain("Signature");
    error.mockRestore();
  });
});
