import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../../../app";
import { MessagingError } from "../../../shared/messaging-error";

const session = async () => ({ userId: "alice" });
const pair = () => ({ find: vi.fn(async () => ({ conversationId: "pending-thread" })) });

describe("find direct conversation route", () => {
  it("requires a verified actor and never calls storage without one", async () => {
    const findDirectConversation = pair();
    const api = createApp({ messaging: { resolveSession: async () => null, findDirectConversation } });
    expect((await api.request("/api/v1/conversations/direct/bob")).status).toBe(401);
    expect(findDirectConversation.find).not.toHaveBeenCalled();
  });

  it("requires username setup and validates recipient IDs before querying storage", async () => {
    const findDirectConversation = pair();
    const noUsername = createApp({ messaging: { resolveSession: session, hasUsername: async () => false, findDirectConversation } });
    expect((await noUsername.request("/api/v1/conversations/direct/bob")).status).toBe(403);
    const invalid = createApp({ messaging: { resolveSession: session, findDirectConversation } });
    expect((await invalid.request(`/api/v1/conversations/direct/${"a".repeat(300)}`)).status).toBe(422);
    expect(findDirectConversation.find).not.toHaveBeenCalled();
  });

  it("returns only the actor-owned thread ID without caching its response", async () => {
    const findDirectConversation = pair();
    const api = createApp({ messaging: { resolveSession: session, findDirectConversation } });
    const response = await api.request("/api/v1/conversations/direct/bob");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ conversationId: "pending-thread" });
    expect(findDirectConversation.find).toHaveBeenCalledWith("alice", "bob");
  });

  it("fails closed when storage is unavailable, the pair is absent, or either member blocked it", async () => {
    const unavailable = createApp({ messaging: { resolveSession: session } });
    expect((await unavailable.request("/api/v1/conversations/direct/bob")).status).toBe(503);
    for (const [error, expectedStatus] of [["NOT_FOUND", 404], ["BLOCKED", 403]] as const) {
      const findDirectConversation = { find: vi.fn(async () => { throw new MessagingError(error); }) };
      const api = createApp({ messaging: { resolveSession: session, findDirectConversation } });
      const response = await api.request("/api/v1/conversations/direct/bob");
      expect(response.status).toBe(expectedStatus);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(JSON.stringify(await response.json())).not.toContain("conversationId");
    }
  });
});
