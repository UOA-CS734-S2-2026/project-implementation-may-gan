import { DailyPostFromJSON, PostDetailFromJSON, type PostDetail } from "@dayli/api-client";
import { describe, expect, it } from "vitest";

const prompt = { id: "prompt-1", text: "What made you smile today?" };
const common = {
  id: "post-1",
  localDate: "2026-09-25",
  prompt,
  reflectiveAnswer: "Walked to the harbour.",
  caption: "Sunset",
  rating: 7,
  audience: "friends",
  acceptedAt: "2026-09-25T03:00:00.000Z",
  releasedAt: "2026-09-25T12:00:00.000Z",
  media: [],
};
const postDetail = {
  ...common,
  author: { id: "user-1", username: "friend", displayName: "Friend" },
  edited: false,
  viewerIsAuthor: false,
};
const dailyPost = { ...common, authorId: "user-1", tomorrowNote: { availableOn: "2026-09-26" } };

describe("generated client voiceMemo decoding", () => {
  it("decodes a post whose voiceMemo is null as null, not undefined", () => {
    expect(PostDetailFromJSON({ ...postDetail, voiceMemo: null }).voiceMemo).toBeNull();
    expect(DailyPostFromJSON({ ...dailyPost, voiceMemo: null }).voiceMemo).toBeNull();
  });

  it("types voiceMemo as nullable but required", () => {
    // Compile-time (the web typecheck runs these files): null is allowed, omitting the key is not.
    const detail: PostDetail = { ...PostDetailFromJSON({ ...postDetail, voiceMemo: null }), voiceMemo: null };
    // @ts-expect-error voiceMemo is a required key
    const omitted: PostDetail = { ...detail, voiceMemo: undefined };
    expect(detail.voiceMemo).toBeNull();
    expect(omitted).toBeDefined();
  });

  it("decodes a post with a voice memo", () => {
    const post = PostDetailFromJSON({
      ...postDetail,
      voiceMemo: {
        id: "media-9",
        contentType: "audio/mp4",
        url: "https://storage.example.test/memo?signature=abc",
        expiresAt: "2026-09-26T03:05:00.000Z",
      },
    });
    expect(post.voiceMemo?.id).toBe("media-9");
    expect(post.voiceMemo?.contentType).toBe("audio/mp4");
  });
});
