import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../../app";

describe("unregister push device route", () => {
  it("removes a device for the verified session", async () => {
    const unregister = vi.fn(async () => undefined);
    const api = createApp({
      pushDevices: {
        resolveSession: async () => ({ userId: "alice" }),
        resolvePushSession: async () => ({ userId: "alice", sessionId: "session" }),
        devices: { register: async () => undefined, unregister },
      },
    });
    const response = await api.request("/api/v1/push/devices/install", { method: "DELETE" });
    expect(response.status).toBe(204);
    expect(unregister).toHaveBeenCalledWith({ userId: "alice", sessionId: "session" }, "install");
  });
});
