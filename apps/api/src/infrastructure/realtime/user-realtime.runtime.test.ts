import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("UserRealtime Durable Object", () => {
  it("rejects an upgrade without Worker-issued verified session metadata", async () => {
    const realtime = (env as unknown as { USER_REALTIME: DurableObjectNamespace }).USER_REALTIME;
    const stub = realtime.get(realtime.idFromName("user"));
    const response = await stub.fetch("https://user-realtime.internal/connect", { headers: { Upgrade: "websocket" } });
    expect(response.status).toBe(401);
  });
});
