import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../app";

describe("notification preference routes", () => {
  it("reads a missing owner row as disabled and writes only the verified owner", async () => {
    const read = vi.fn(async () => false);
    const write = vi.fn(async (_userId: string, enabled: boolean) => enabled);
    const api = createApp({
      notifications: {
        resolveSession: async () => ({ userId: "verified-owner" }),
        store: { read, write },
      },
    });

    const get = await api.request("/api/v1/notifications/preference");
    expect(get.status).toBe(200);
    expect(await get.json()).toEqual({ enabled: false });
    expect(read).toHaveBeenCalledWith("verified-owner");

    const put = await api.request("/api/v1/notifications/preference", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ enabled: true });
    expect(write).toHaveBeenCalledWith("verified-owner", true);
  });

  it("does not accept an owner identifier in the body", async () => {
    const write = vi.fn(async () => true);
    const api = createApp({
      notifications: {
        resolveSession: async () => ({ userId: "verified-owner" }),
        store: { read: async () => false, write },
      },
    });
    const response = await api.request("/api/v1/notifications/preference", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: true, userId: "another-user" }),
    });
    expect(response.status).toBe(422);
    expect(write).not.toHaveBeenCalled();
  });

  it("requires a verified session", async () => {
    const api = createApp();
    expect((await api.request("/api/v1/notifications/preference")).status).toBe(401);
  });
});
