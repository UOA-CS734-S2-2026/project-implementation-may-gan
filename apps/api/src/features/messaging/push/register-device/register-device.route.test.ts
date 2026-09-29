import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../../app";

describe("register push device route", () => {
  it("registers a device for the verified session", async () => {
    const register = vi.fn(async () => undefined);
    const api = createApp({
      pushDevices: {
        resolveSession: async () => ({ userId: "alice" }),
        resolvePushSession: async () => ({ userId: "alice", sessionId: "session" }),
        devices: { register, unregister: async () => undefined },
      },
    });
    const response = await api.request("/api/v1/push/devices/install", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "a-valid-provider-token", platform: "ios", optedIn: true }),
    });
    expect(response.status).toBe(204);
    expect(register).toHaveBeenCalledWith(
      { userId: "alice", sessionId: "session" },
      { installationId: "install", token: "a-valid-provider-token", platform: "ios", optedIn: true },
    );
  });
});
