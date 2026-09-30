import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../../../app";
import type { MessagingRouteDependencies } from "../../../messaging.routes";

const direct = { create: vi.fn(async (actorId: string, input: { recipientId: string }) => ({ replayed: false, conversation: { id: "c1", peerId: input.recipientId, requestState: "pending" as const }, message: { id: "m1", conversationId: "c1", sequence: "1", senderId: actorId, clientMessageId: "client", text: "hello", replyToMessageId: null, replyPreview: null, version: 1, createdAt: "2026-09-28T00:00:00.000Z", editedAt: null, unsentAt: null, reactions: [] } })) };
function app(resolveSession: MessagingRouteDependencies["resolveSession"] = async () => ({ userId: "alice" })) { return createApp({ messaging: { resolveSession, direct } }); }

describe("create direct conversation route", () => {
  it("creates a direct request using only the verified actor", async () => {
    const response = await app().request("/api/v1/conversations/direct", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recipientId: "bob", clientMessageId: "client", text: "hello" }) });
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(direct.create).toHaveBeenCalledWith("alice", expect.objectContaining({ recipientId: "bob" }));
  });
  it("denies creation without a session before invoking the service", async () => {
    direct.create.mockClear();
    const response = await app(async () => null).request("/api/v1/conversations/direct", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recipientId: "bob", clientMessageId: "client", text: "hello" }) });
    expect(response.status).toBe(401);
    expect(direct.create).not.toHaveBeenCalled();
  });

});
