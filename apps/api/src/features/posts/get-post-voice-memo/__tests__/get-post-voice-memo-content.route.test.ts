import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../../app";
import type { MediaObjectStore } from "../../../../infrastructure/media/r2";
import type { PostVoiceMemoRepository } from "../get-post-voice-memo.repository";

const path = "/api/v1/posts/post-1/voice-memo/content";
const now = new Date("2026-10-03T12:00:00.000Z");
const memo = { id: "memo-1", postId: "post-1", contentType: "audio/mp4" as const, objectKey: "media/owner/memo" };

describe("GET /api/v1/posts/{postId}/voice-memo/content", () => {
  it("uses the parent-authorized media decision before streaming", async () => {
    const findVoiceMemo = vi.fn<PostVoiceMemoRepository["findVoiceMemo"]>(async () => memo);
    const fetch = vi.fn<MediaObjectStore["fetch"]>(async () => new Response(new Uint8Array([9]), {
      headers: { "content-type": "audio/mp4" },
    }));
    const response = await createApp({ postVoiceMemoContent: {
      resolveSession: async () => null,
      repository: { findVoiceMemo },
      objects: { fetch },
      now: () => now,
    } }).request(path);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(findVoiceMemo).toHaveBeenCalledWith(null, "post-1", now, "parent-authorized");
    expect(fetch).toHaveBeenCalledWith(memo.objectKey, expect.objectContaining({ method: "GET" }));
  });

  it("does not touch object storage after withdrawal", async () => {
    const fetch = vi.fn<MediaObjectStore["fetch"]>();
    const response = await createApp({ postVoiceMemoContent: {
      resolveSession: async () => null,
      repository: { findVoiceMemo: async () => null },
      objects: { fetch },
    } }).request(path);

    expect(response.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
});
