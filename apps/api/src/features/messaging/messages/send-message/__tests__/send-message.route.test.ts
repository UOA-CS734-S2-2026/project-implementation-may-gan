import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../../../app";
import type { MessagingRouteDependencies } from "../../../messaging.routes";

const service = { send: vi.fn(async (actorId: string, conversationId: string) => ({ replayed: false, message: { id: "m1", conversationId, sequence: "1", senderId: actorId, clientMessageId: "client", text: "hello", replyToMessageId: null, replyPreview: null, version: 1, createdAt: "2026-09-28T00:00:00.000Z", editedAt: null, unsentAt: null, reactions: [] } })) };
function app(resolveSession: MessagingRouteDependencies["resolveSession"] = async () => ({ userId: "alice" })) { return createApp({ messaging: { resolveSession, service } }); }
function request(api: ReturnType<typeof app>, body: unknown = { clientMessageId: "client", text: "hello" }) { return api.request("/api/v1/conversations/c1/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); }

describe("POST /conversations/{id}/messages", () => {
  it("uses only the server verified actor and never caches private messages", async () => {
    const response = await request(app());
    expect(response.status).toBe(201); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(service.send).toHaveBeenCalledWith("alice", "c1", expect.objectContaining({ text: "hello" }));
  });
  it("denies absent credentials without invoking the service", async () => {
    service.send.mockClear(); const response = await request(app(async () => null));
    expect(response.status).toBe(401); expect(service.send).not.toHaveBeenCalled();
  });
  it("reports resolver outages as 503", async () => {
    const response = await request(app(async () => { throw new Error("auth down"); }));
    expect(response.status).toBe(503);
  });

  it("schedules bounded immediate dispatch only after a saved response", async () => {
    const dispatchImmediately = vi.fn(async () => undefined);
    const api = createApp({ messaging: { resolveSession: async () => ({ userId: "alice" }), service, dispatchImmediately } });
    const waits: Promise<unknown>[] = [];
    const response = await api.fetch(
      new Request("http://localhost/api/v1/conversations/c1/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientMessageId: "client", text: "hello" }) }),
      undefined,
      { waitUntil: (promise) => { waits.push(promise); }, passThroughOnException: () => undefined, props: undefined },
    );
    expect(response.status).toBe(201);
    expect(dispatchImmediately).toHaveBeenCalledTimes(1);
    await Promise.all(waits);
  });
});
