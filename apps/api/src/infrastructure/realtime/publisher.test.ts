import { describe, expect, it, vi } from "vitest";
import { createDurableObjectRealtimePublisher } from "./publisher";
import type { OutboxJob } from "../jobs/outbox-store";

describe("realtime session lifecycle", () => {
  it("routes Better Auth session revocation to the authenticated user's object only", async () => {
    const revokeSession = vi.fn(async () => undefined);
    const namespace = {
      idFromName: vi.fn((userId: string) => userId),
      get: vi.fn(() => ({ revokeSession })),
    } as unknown as DurableObjectNamespace;
    const publisher = createDurableObjectRealtimePublisher(namespace, { connectionString: "postgresql://unused" });
    await publisher.revokeSession("alice", "session-a");
    expect(namespace.idFromName).toHaveBeenCalledWith("alice");
    expect(revokeSession).toHaveBeenCalledWith("session-a");
  });

  it("delivers a body-free event through the private Durable Object endpoint", async () => {
    const fetch = vi.fn<(request: Request) => Promise<Response>>(async () => new Response(null, { status: 204 }));
    const namespace = { idFromName: (userId: string) => userId, get: () => ({ fetch, revokeSession: async () => undefined }) } as unknown as DurableObjectNamespace;
    const job: OutboxJob = { id: "job", eventId: "event", recipientId: "bob", conversationId: "conversation", changeSequence: "4", channel: "realtime", deviceRegistrationId: null, attempts: 1, leaseToken: "lease", leaseExpiresAt: new Date() };
    const publisher = createDurableObjectRealtimePublisher(namespace, { connectionString: "postgresql://unused" }, async () => true);
    await expect(publisher.deliver(job)).resolves.toEqual({ ok: true });
    const request = fetch.mock.calls[0]![0] as Request;
    expect(request.url).toBe("https://user-realtime.internal/publish");
    expect(await request.json()).toEqual({ version: 1, eventId: "event", type: "conversation.changed", conversationId: "conversation", changeSequence: "4" });
  });

  it("suppresses a delayed peer event after a block policy recheck", async () => {
    const fetch = vi.fn<(request: Request) => Promise<Response>>(async () => new Response(null, { status: 204 }));
    const namespace = { idFromName: (userId: string) => userId, get: () => ({ fetch, revokeSession: async () => undefined }) } as unknown as DurableObjectNamespace;
    const job: OutboxJob = { id: "job", eventId: "event", recipientId: "bob", conversationId: "conversation", changeSequence: "4", channel: "realtime", deviceRegistrationId: null, attempts: 1, leaseToken: "lease", leaseExpiresAt: new Date() };
    const authorize = vi.fn(async () => false);
    const publisher = createDurableObjectRealtimePublisher(namespace, { connectionString: "postgresql://unused" }, authorize);
    await expect(publisher.deliver(job)).resolves.toEqual({ ok: true });
    expect(authorize).toHaveBeenCalledWith(job);
    expect(fetch).not.toHaveBeenCalled();
  });
});
