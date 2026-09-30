import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  close: vi.fn(async () => undefined),
  create: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@dayli/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dayli/db")>();
  database.create.mockImplementation(() => ({
    db: { select: database.select },
    close: database.close,
  }));
  return { ...actual, createHyperdriveDatabase: database.create };
});

function sessionHeader(userId: string, sessionId: string, expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()): Headers {
  return new Headers({
    Upgrade: "websocket",
    "x-dayli-realtime-session": JSON.stringify({ userId, sessionId, expiresAt, version: 1 }),
  });
}

function setSessionRows(rows: Array<{ id: string }>): void {
  database.select.mockImplementation(() => ({
    from: () => ({
      where: () => ({
        limit: async () => rows,
      }),
    }),
  }));
}

describe("UserRealtime Durable Object", () => {
  beforeEach(() => {
    database.close.mockClear();
    database.create.mockClear();
    database.select.mockClear();
  });

  it("accepts verified metadata for an active session after checking it in the Durable Object", async () => {
    setSessionRows([{ id: "active-session" }]);
    const realtime = (env as unknown as { USER_REALTIME: DurableObjectNamespace }).USER_REALTIME;
    const response = await realtime.get(realtime.idFromName("active-user")).fetch("https://user-realtime.internal/connect", {
      headers: sessionHeader("active-user", "active-session"),
    });

    expect(response.status).toBe(101);
    expect(database.create).toHaveBeenCalledOnce();
    expect(database.select).toHaveBeenCalledOnce();
    expect(database.close).toHaveBeenCalledOnce();
  });

  it("denies verified metadata when the session is banned or revoked", async () => {
    setSessionRows([]);
    const realtime = (env as unknown as { USER_REALTIME: DurableObjectNamespace }).USER_REALTIME;
    const response = await realtime.get(realtime.idFromName("banned-user")).fetch("https://user-realtime.internal/connect", {
      headers: sessionHeader("banned-user", "banned-session"),
    });

    expect(response.status).toBe(401);
    expect(database.select).toHaveBeenCalledOnce();
  });

  it("denies expired verified metadata", async () => {
    setSessionRows([{ id: "expired-session" }]);
    const realtime = (env as unknown as { USER_REALTIME: DurableObjectNamespace }).USER_REALTIME;
    const response = await realtime.get(realtime.idFromName("expired-user")).fetch("https://user-realtime.internal/connect", {
      headers: sessionHeader("expired-user", "expired-session", new Date(Date.now() - 60 * 60 * 1000).toISOString()),
    });

    expect(response.status).toBe(401);
    expect(database.select).not.toHaveBeenCalled();
  });

  it("rejects an upgrade without Worker-issued verified session metadata", async () => {
    const realtime = (env as unknown as { USER_REALTIME: DurableObjectNamespace }).USER_REALTIME;
    const stub = realtime.get(realtime.idFromName("user"));
    const response = await stub.fetch("https://user-realtime.internal/connect", { headers: { Upgrade: "websocket" } });
    expect(response.status).toBe(401);
  });
});
