import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../../app";
import type { DeletionRouteDependencies } from "../deletion.route";

const url = "https://api.example.test/api/v1/account/deletion";
const actor = { userId: "owner", sessionId: "live-session" };
const grantToken = "a".repeat(64);
const idempotencyKey = "unique-request-key-001";
const requestedAt = new Date("2026-10-02T09:00:00Z");
const cancelUntil = new Date("2026-10-09T09:00:00Z");
const purgeDueAt = new Date("2026-10-16T09:00:00Z");
const request = (path: "/request" | "/cancel", header = idempotencyKey, token = grantToken) => new Request(`${url}${path}`, {
  method: "POST",
  headers: { "content-type": "application/json", "Idempotency-Key": header },
  body: JSON.stringify({ grantToken: token }),
});

function fixture(state?: { lifecycleState: "pending_deletion" }, overrides: Partial<DeletionRouteDependencies> = {}) {
  const resolveSession = async () => actor;
  const requestCommand = vi.fn(async () => ({
    status: "requested" as const, requestId: "request-001", requestedAt, cancelUntil, purgeDueAt,
    revokedSessionIds: [actor.sessionId],
  }));
  const cancelCommand = vi.fn(async () => ({ status: "cancelled" as const, generation: 2 }));
  const revokeSessions = vi.fn(async () => {});
  const deps: DeletionRouteDependencies = {
    resolveSession,
    rateLimiter: { check: async () => "allowed" },
    requestEnabled: true,
    status: async () => ({
      state: "pending_deletion", generation: 1, requestId: "request-001",
      requestedAt, cancelUntil, purgeDueAt,
    }),
    request: requestCommand,
    cancel: cancelCommand,
    revokeSessions,
    onRevocationFailure: vi.fn(),
    ...overrides,
  };
  return {
    api: createApp({
      accountPolicy: { resolveSession, policies: { resolve: async () => state
        ? { restriction: "pending_deletion" as const, allowed: new Set(["policy_read", "cancel_deletion_verification"] as const) }
        : { restriction: "active" as const, allowed: new Set(["policy_read", "request_deletion", "cancel_deletion_verification"] as const) },
      } },
      deletion: deps,
    }),
    requestCommand, cancelCommand, revokeSessions, deps,
  };
}

describe("inactive account deletion routes", () => {
  it("reads only the session owner's content-free lifecycle status", async () => {
    const { api } = fixture({ lifecycleState: "pending_deletion" });
    const response = await api.request(new Request(url));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      state: "pending_deletion", generation: 1, requestId: "request-001",
      requestedAt: requestedAt.toISOString(), cancelUntil: cancelUntil.toISOString(), purgeDueAt: purgeDueAt.toISOString(),
    });
  });

  it("refuses requests unless explicit activation and all revocation dependencies exist", async () => {
    const inactive = fixture(undefined, { requestEnabled: false });
    expect((await inactive.api.request(request("/request"))).status).toBe(503);
    expect(inactive.requestCommand).not.toHaveBeenCalled();
    const noRevoke = fixture(undefined, { revokeSessions: undefined });
    expect((await noRevoke.api.request(request("/request"))).status).toBe(503);
    expect(noRevoke.requestCommand).not.toHaveBeenCalled();
  });

  it("consumes the actor-bound request and attempts socket revocation after commit", async () => {
    const { api, requestCommand, revokeSessions } = fixture();
    const response = await api.request(request("/request"));
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(requestCommand).toHaveBeenCalledWith({
      userId: actor.userId, sessionId: actor.sessionId, grantToken, idempotencyKey,
    });
    expect(revokeSessions).toHaveBeenCalledWith(actor.userId, [actor.sessionId]);
    await expect(response.json()).resolves.toMatchObject({ status: "requested", requestId: "request-001" });
  });

  it("never reports an already committed request as failed when revocation throws", async () => {
    const onRevocationFailure = vi.fn();
    const { api } = fixture(undefined, {
      revokeSessions: vi.fn(async () => { throw new Error("realtime unavailable"); }),
      onRevocationFailure,
    });
    const response = await api.request(request("/request"));
    expect(response.status).toBe(201);
    expect(onRevocationFailure).toHaveBeenCalledOnce();
  });

  it("limits replays to policy and uses a status read to recover a lost response", async () => {
    const pending = fixture({ lifecycleState: "pending_deletion" }, { requestEnabled: false });
    expect((await pending.api.request(request("/request"))).status).toBe(403);
    expect(pending.requestCommand).not.toHaveBeenCalled();
    expect((await pending.api.request(new Request(url))).status).toBe(200);
    expect((await pending.api.request(request("/cancel"))).status).toBe(200);
    expect(pending.cancelCommand).toHaveBeenCalledWith({
      userId: actor.userId, sessionId: actor.sessionId, grantToken,
    });
  });

  it("rejects malformed input, failed proofs, and an unavailable rate limiter", async () => {
    const malformed = fixture();
    expect((await malformed.api.request(request("/request", "too-short"))).status).toBe(422);
    expect((await malformed.api.request(request("/cancel", idempotencyKey, "invalid"))).status).toBe(422);
    expect(malformed.requestCommand).not.toHaveBeenCalled();
    const invalid = fixture(undefined, { request: async () => ({ status: "invalid_grant" }) });
    expect((await invalid.api.request(request("/request"))).status).toBe(403);
    const limited = fixture(undefined, { rateLimiter: { check: async () => "unavailable" } });
    expect((await limited.api.request(request("/request"))).status).toBe(503);
    expect(limited.requestCommand).not.toHaveBeenCalled();
  });
});
