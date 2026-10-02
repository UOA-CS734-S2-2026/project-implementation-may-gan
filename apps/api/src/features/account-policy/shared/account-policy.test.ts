import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../app";
import { accountCapabilityForRequest } from "./account-policy.middleware";
import { allowsAccountCapability, resolveAccountPolicy } from "./account-policy";

const classify = (method: string, path: string, body?: unknown) => accountCapabilityForRequest(new Request(`https://api.example.test${path}`, {
  method,
  headers: body === undefined ? undefined : { "content-type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
}));

describe("account policy", () => {
  it("keeps missing lifecycle rows active and draft Terms ineffective", () => {
    expect(resolveAccountPolicy(undefined).restriction).toBe("active");
    expect(resolveAccountPolicy({ termsRequired: false, ageDeclarationRequired: false }).restriction).toBe("active");
  });

  it("gives active bans priority and keeps purging ahead of underage and legal gates", () => {
    expect(resolveAccountPolicy({ banned: true, lifecycleState: "pending_deletion" }).restriction).toBe("banned");
    expect(resolveAccountPolicy({ lifecycleState: "purging", temporarilyRestricted: true }).restriction).toBe("purging");
    expect(resolveAccountPolicy({ lifecycleState: "purge_failed", termsRequired: true }).restriction).toBe("purge_failed");
    expect(resolveAccountPolicy({ lifecycleState: "pending_deletion", temporarilyRestricted: true }).restriction).toBe("underage_restricted");
  });

  it("keeps restricted cleanup limited to reviewed negative operations", () => {
    const policy = resolveAccountPolicy({ lifecycleState: "pending_deletion" });
    expect(allowsAccountCapability(policy, "ordinary")).toBe(false);
    expect(allowsAccountCapability(policy, "restricted_cleanup")).toBe(true);
  });

  it("uses exact public and cleanup route matching, with request acceptance still ordinary", async () => {
    await expect(classify("GET", "/api/v1/test")).resolves.toBeUndefined();
    await expect(classify("GET", "/api/v1/test-contracts")).resolves.toBe("ordinary");
    await expect(classify("GET", "/api/v1/account/status")).resolves.toBe("policy_read");
    await expect(classify("DELETE", "/api/v1/conversations/c/messages/m")).resolves.toBe("restricted_cleanup");
    await expect(classify("DELETE", "/api/v1/conversations/c/messages/m/reaction")).resolves.toBe("restricted_cleanup");
    await expect(classify("POST", "/api/v1/relationships/requests/r/decline")).resolves.toBe("restricted_cleanup");
    await expect(classify("DELETE", "/api/v1/relationships/u/friendship")).resolves.toBe("restricted_cleanup");
    await expect(classify("DELETE", "/api/v1/relationships/u/block")).resolves.toBe("restricted_cleanup");
    await expect(classify("DELETE", "/api/v1/push/devices/installation")).resolves.toBe("restricted_cleanup");
    await expect(classify("DELETE", "/api/v1/profile/avatar")).resolves.toBe("restricted_cleanup");
    await expect(classify("PUT", "/api/v1/conversations/c/request", { decision: "decline" })).resolves.toBe("restricted_cleanup");
    await expect(classify("PUT", "/api/v1/conversations/c/request", { decision: "accept" })).resolves.toBe("ordinary");
    await expect(classify("DELETE", "/api/v1/conversations/c/messages/m/extra")).resolves.toBe("ordinary");
  });

  it("allows a pending account to run only an owner-scoped cleanup route", async () => {
    const unregister = vi.fn(async () => undefined);
    const api = createApp({
      accountPolicy: {
        resolveSession: async () => ({ userId: "pending-user" }),
        policies: { resolve: async () => resolveAccountPolicy({ lifecycleState: "pending_deletion" }) },
      },
      pushDevices: {
        resolveSession: async () => ({ userId: "pending-user" }),
        resolvePushSession: async () => ({ userId: "pending-user", sessionId: "session", expiresAt: new Date("2099-01-01") }),
        hasUsername: async () => true,
        unregister: { unregister },
      },
    });
    const cleanup = await api.request("https://api.example.test/api/v1/push/devices/owned-installation", { method: "DELETE" });
    expect(cleanup.status).toBe(204);
    expect(unregister).toHaveBeenCalledWith("pending-user", "owned-installation");

    const positive = await api.request("https://api.example.test/api/v1/conversations/c/request", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "accept" }),
    });
    expect(positive.status).toBe(403);
  });

  it("returns no-store policy errors and denies unauthenticated future routes", async () => {
    const api = createApp({
      accountPolicy: {
        resolveSession: async () => null,
        policies: { resolve: async () => { throw new Error("must not resolve"); } },
      },
    });
    api.get("/api/v1/future-route", (context) => context.json({ leaked: true }));
    const response = await api.request("https://api.example.test/api/v1/future-route");
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ error: { code: "UNAUTHENTICATED" } });

    const unavailable = createApp({
      accountPolicy: {
        resolveSession: async () => ({ userId: "user" }),
        policies: { resolve: async () => { throw new Error("database unavailable"); } },
      },
    });
    const failure = await unavailable.request("https://api.example.test/api/v1/feed");
    expect(failure.status).toBe(503);
    expect(failure.headers.get("cache-control")).toBe("no-store");
  });

  it("leaves the actual public test route available to guests and restricted accounts", async () => {
    const guest = createApp({
      accountPolicy: { resolveSession: async () => null, policies: { resolve: async () => resolveAccountPolicy(undefined) } },
    });
    expect((await guest.request("https://api.example.test/api/v1/test")).status).toBe(200);

    const restricted = createApp({
      accountPolicy: {
        resolveSession: async () => ({ userId: "pending-user" }),
        policies: { resolve: async () => resolveAccountPolicy({ lifecycleState: "pending_deletion" }) },
      },
    });
    expect((await restricted.request("https://api.example.test/api/v1/test")).status).toBe(200);
  });
});
