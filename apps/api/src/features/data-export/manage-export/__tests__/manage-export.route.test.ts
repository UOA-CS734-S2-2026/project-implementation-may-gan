import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../../app";
import type { ExportRouteDependencies } from "../manage-export.route";

const owner = { userId: "owner", sessionId: "session" };
const requestId = crypto.randomUUID();
function dependencies(enabled = true): ExportRouteDependencies {
  return {
    resolveSession: async () => owner,
    enabled,
    rateLimiter: { check: async () => "allowed" },
    status: vi.fn(async () => null),
    request: vi.fn(async (_userId, _sessionId, id) => ({ requestId: id, status: "requested" as const,
      requestedAt: "2026-09-01T00:00:00.000Z" })),
    download: vi.fn(async () => ({ size: 3,
      body: new ReadableStream<Uint8Array>({ start(controller) {
        controller.enqueue(new Uint8Array([80, 75, 3])); controller.close();
      } }),
    })),
  };
}

describe("account export routes", () => {
  it("are registered but unavailable without a separate activation decision", async () => {
    const deps = dependencies(false);
    const app = createApp({ exportService: deps });
    for (const [method, path] of [["GET", "/api/v1/account/export"],
      ["POST", "/api/v1/account/export/request"],
      ["GET", `/api/v1/account/export/${requestId}/download`]]) {
      const response = await app.request(`https://api.example.test${path}`, { method });
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(deps.status).not.toHaveBeenCalled();
    expect(deps.request).not.toHaveBeenCalled();
    expect(deps.download).not.toHaveBeenCalled();
  });

  it("does not expose a staging proof to any other signed-in owner", async () => {
    const deps = { ...dependencies(), allowedUserId: "synthetic-owner" };
    const app = createApp({ exportService: deps });
    for (const [method, path] of [["GET", "/api/v1/account/export"],
      ["POST", "/api/v1/account/export/request"],
      ["GET", `/api/v1/account/export/${requestId}/download`]]) {
      const response = await app.request(`https://api.example.test${path}`, { method });
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(deps.status).not.toHaveBeenCalled();
    expect(deps.request).not.toHaveBeenCalled();
    expect(deps.download).not.toHaveBeenCalled();
  });

  it("allows eligible Terms-blocked owners to request, check, and stream without a signed URL", async () => {
    const deps = { ...dependencies(), allowedUserId: owner.userId };
    const app = createApp({ exportService: deps, accountPolicy: {
      resolveSession: deps.resolveSession,
      policies: { resolve: async () => ({ restriction: "terms_blocked" as const, allowed: new Set(["export" as const]) }) },
    } });
    const status = await app.request("https://api.example.test/api/v1/account/export");
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({ status: "none", requestId: null });
    const request = await app.request("https://api.example.test/api/v1/account/export/request", { method: "POST" });
    expect(request.status).toBe(201);
    expect(await request.json()).toMatchObject({ status: "requested" });
    const download = await app.request(`https://api.example.test/api/v1/account/export/${requestId}/download`);
    expect(download.status).toBe(200);
    expect(download.headers.get("content-type")).toBe("application/zip");
    expect(download.headers.get("cache-control")).toBe("no-store, private");
    expect(download.headers.get("content-disposition")).toContain("attachment");
    expect(Array.from(new Uint8Array(await download.arrayBuffer()))).toEqual([80, 75, 3]);
    expect(deps.download).toHaveBeenCalledWith(owner.userId, owner.sessionId, requestId);
  });

  it("denies purging accounts before invoking export sources", async () => {
    const deps = dependencies();
    const app = createApp({ exportService: deps, accountPolicy: {
      resolveSession: deps.resolveSession,
      policies: { resolve: async () => ({ restriction: "purging" as const, allowed: new Set(["policy_read" as const]) }) },
    } });
    const response = await app.request(`https://api.example.test/api/v1/account/export/${requestId}/download`);
    expect(response.status).toBe(403);
    expect(deps.download).not.toHaveBeenCalled();
  });
});
