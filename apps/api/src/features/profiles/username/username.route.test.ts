import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../app";
import type { UsernameProfileStore } from "./username.repository";

function appWith(store: UsernameProfileStore) {
  return createApp({ usernameProfile: { resolveSession: async () => ({ userId: "actor" }), store } });
}

describe("username setup route", () => {
  it("is private, actor-scoped, and marks responses no-store", async () => {
    const get = vi.fn(async (id: string) => id === "actor" ? { username: null, publicName: null, needsUsernameSetup: true } : null);
    const response = await appWith({ get, claimInitial: async () => "missing" }).request("/api/v1/profile/username");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ username: null, publicName: null, needsUsernameSetup: true });
    expect(get).toHaveBeenCalledWith("actor");
  });

  it("claims only the authenticated account and never exposes a rename", async () => {
    const claimInitial = vi.fn(async () => "claimed" as const);
    const get = vi.fn(async () => ({ username: "new_handle", publicName: "New", needsUsernameSetup: false }));
    const response = await appWith({ get, claimInitial }).request("/api/v1/profile/username", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "NEW_HANDLE", publicName: "New" }),
    });
    expect(response.status).toBe(200);
    expect(claimInitial).toHaveBeenCalledWith("actor", { username: "new_handle", publicName: "New" });
    expect(await response.json()).toEqual({ username: "new_handle", publicName: "New", needsUsernameSetup: false });
  });

  it("does not permit a second setup or a duplicate claim", async () => {
    const store: UsernameProfileStore = { get: async () => null, claimInitial: async () => "already_setup" };
    const response = await appWith(store).request("/api/v1/profile/username", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "taken_name" }),
    });
    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
