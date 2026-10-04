import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../../../app";

describe("register push device route", () => {
  it("registers a device for the verified session", async () => {
    const register = vi.fn(async () => undefined);
    const api = createApp({
      pushDevices: {
        resolveSession: async () => ({ userId: "alice" }),
        resolvePushSession: async () => ({ userId: "alice", sessionId: "session" }),
        register: { register },
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

  it("accepts capability version 1 and rejects unsupported versions", async () => {
    const register = vi.fn(async () => undefined);
    const api = createApp({
      pushDevices: {
        resolveSession: async () => ({ userId: "alice" }),
        resolvePushSession: async () => ({ userId: "alice", sessionId: "session" }),
        register: { register },
      },
    });
    const capable = await api.request("/api/v1/push/devices/install", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "a-valid-provider-token", platform: "ios", optedIn: true, notificationSchemaVersion: 1 }),
    });
    expect(capable.status).toBe(204);
    expect(register).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ notificationSchemaVersion: 1 }));

    const unsupported = await api.request("/api/v1/push/devices/install", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "a-valid-provider-token", platform: "ios", optedIn: true, notificationSchemaVersion: 2 }),
    });
    expect(unsupported.status).toBe(422);
    expect(register).toHaveBeenCalledTimes(1);
  });
});
