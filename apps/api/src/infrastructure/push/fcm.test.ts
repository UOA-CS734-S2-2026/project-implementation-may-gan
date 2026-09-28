import { describe, expect, it, vi } from "vitest";
import { buildFcmPayload } from "./fcm";
import { createPushOutboxHandler } from "./push-dispatcher";

const job = { id: "push-job", eventId: "event", recipientId: "peer", conversationId: "conversation", changeSequence: "4", channel: "push" as const, deviceRegistrationId: "device", attempts: 1, leaseToken: "lease", leaseExpiresAt: new Date() };

describe("FCM HTTP v1 adapter", () => {
  it("constructs a generic, body-free notification payload", () => {
    const payload = JSON.stringify(buildFcmPayload({ token: "secret-device-token", eventId: "event", conversationId: "conversation" }));
    expect(payload).toContain("New message on Dayli");
    expect(payload).toContain('"eventId":"event"');
    expect(payload).not.toContain("Alice");
    expect(payload).not.toContain("message body");
  });

  it("invalidates a permanently rejected registration and treats stale policy as suppression", async () => {
    const invalidate = vi.fn(async () => undefined);
    const sender = { send: vi.fn(async () => ({ ok: false as const, retryable: false, category: "provider_rejected" as const })) };
    const handler = createPushOutboxHandler({ destinations: { resolve: async () => ({ token: "private", valid: true }), invalidate }, sender });
    await expect(handler(job)).resolves.toMatchObject({ ok: false, category: "provider_rejected" });
    expect(invalidate).toHaveBeenCalledWith("device");
    const suppressed = createPushOutboxHandler({ destinations: { resolve: async () => null, invalidate }, sender });
    await expect(suppressed(job)).resolves.toEqual({ ok: true });
  });
});
