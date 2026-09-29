import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../../app";

const direct = {
  create: vi.fn(async () => ({
    replayed: false,
    conversation: { id: "conversation", peerId: "bob", requestState: "pending" as const },
    message: { id: "message", conversationId: "conversation", sequence: "1", senderId: "alice", clientMessageId: "client", text: "Hello", replyToMessageId: null, replyPreview: null, version: 1, createdAt: "2026-09-28T00:00:00.000Z", editedAt: null, unsentAt: null, reactions: [] },
  })),
};
const reader = { list: vi.fn(async () => ({ items: [], nextCursor: null })) };
const send = vi.fn(async () => ({ replayed: false, message: { id: "message", conversationId: "conversation", sequence: "1", senderId: "alice", clientMessageId: "client", text: "Hello", replyToMessageId: null, replyPreview: null, version: 1, createdAt: "2026-09-28T00:00:00.000Z", editedAt: null, unsentAt: null, reactions: [] } }));

function app(hasUsername: () => Promise<boolean>) {
  return createApp({
    messaging: {
      resolveSession: async () => ({ userId: "alice" }),
      hasUsername,
      direct,
      reader: reader as never,
      service: { send },
    },
  });
}

const directBody = { recipientId: "bob", clientMessageId: "client", text: "Hello" };
const messageBody = { clientMessageId: "client", text: "Hello" };

describe("messaging username gate", () => {
  it("blocks username-less actors before conversation reads or mutations expose messaging data", async () => {
    direct.create.mockClear();
    reader.list.mockClear();
    send.mockClear();
    const api = app(async () => false);

    const [directResponse, inboxResponse, messageResponse, actionResponse] = await Promise.all([
      api.request("/api/v1/conversations/direct", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(directBody) }),
      api.request("/api/v1/conversations?folder=inbox"),
      api.request("/api/v1/conversations/conversation/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(messageBody) }),
      api.request("/api/v1/conversations/conversation/messages/message", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "Edited" }) }),
    ]);

    for (const response of [directResponse, inboxResponse, messageResponse, actionResponse]) {
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ error: { code: "FORBIDDEN" } });
    }
    expect(direct.create).not.toHaveBeenCalled();
    expect(reader.list).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("fails closed with a controlled response when the username lookup is unavailable", async () => {
    const response = await app(async () => { throw new Error("database unavailable"); }).request("/api/v1/conversations?folder=inbox");
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "SERVICE_UNAVAILABLE" } });
  });

  it("does not alter messaging authorization for an actor with a username", async () => {
    direct.create.mockClear();
    const response = await app(async () => true).request("/api/v1/conversations/direct", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(directBody),
    });
    expect(response.status).toBe(201);
    expect(direct.create).toHaveBeenCalledWith("alice", expect.objectContaining({ recipientId: "bob" }));
  });
});
