import { MessageFromJSON, PostDetailFromJSON, type Message, type MessageReplyPreview, type PostDetail } from "@dayli/api-client";
import { describe, expect, expectTypeOf, it } from "vitest";

// Guards #195: the OpenAPI document must declare the version its generator
// writes, or generated models drop `| null` from nullable fields.
describe("generated client nullability", () => {
  it("types and decodes a null post caption", () => {
    expectTypeOf<PostDetail["caption"]>().toEqualTypeOf<string | null>();

    const post = PostDetailFromJSON({
      id: "post-1",
      author: { id: "user-1", username: "ana", displayName: "Ana" },
      localDate: "2026-10-01",
      prompt: { id: "prompt-1", text: "What made today?" },
      reflectiveAnswer: "A walk.",
      caption: null,
      rating: 4,
      audience: "friends",
      acceptedAt: "2026-10-01T09:00:00.000Z",
      releasedAt: "2026-10-01T11:00:00.000Z",
      edited: false,
      revisionCount: 0,
      likeCount: 0,
      viewerHasLiked: false,
      commentCount: 0,
      viewerIsAuthor: false,
      media: [],
      voiceMemo: null,
    });

    expect(post.caption).toBeNull();
  });

  it("types and decodes null message text, reply, and timestamps", () => {
    expectTypeOf<Message["text"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Message["replyPreview"]>().toEqualTypeOf<MessageReplyPreview | null>();
    expectTypeOf<Message["editedAt"]>().toEqualTypeOf<Date | null>();

    const message = MessageFromJSON({
      id: "message-1",
      conversationId: "conversation-1",
      sequence: "1",
      senderId: "user-1",
      clientMessageId: "client-1",
      text: null,
      replyToMessageId: null,
      replyPreview: null,
      version: 1,
      createdAt: "2026-10-01T09:00:00.000Z",
      editedAt: null,
      unsentAt: null,
      reactions: [],
    });

    expect(message.text).toBeNull();
    expect(message.replyPreview).toBeNull();
    expect(message.editedAt).toBeNull();
    expect(message.createdAt).toEqual(new Date("2026-10-01T09:00:00.000Z"));
  });
});
