import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedApiEnv } from "../authenticated-actor";
import { createRequireSession } from "./require-session";

function createApp(resolveSession: Parameters<typeof createRequireSession>[0]) {
  const app = new Hono<AuthenticatedApiEnv>();
  const operation = vi.fn((actor: string) => ({ actor }));
  app.use("/protected", createRequireSession(resolveSession));
  app.get("/protected", (context) => context.json(operation(context.get("actor").userId)));
  return { app, operation };
}

describe("createRequireSession", () => {
  it("sets the server-verified actor and permits both credential transport forms", async () => {
    const { app, operation } = createApp(async (request) => {
      const authorization = request.headers.get("authorization");
      const cookie = request.headers.get("cookie");
      return authorization === "Bearer session" || cookie === "session=valid" ? { userId: "user-1" } : null;
    });

    const bearer = await app.request("/protected", { headers: { authorization: "Bearer session" } });
    const cookie = await app.request("/protected", { headers: { cookie: "session=valid" } });

    expect(bearer.status).toBe(200);
    expect(cookie.status).toBe(200);
    expect(operation).toHaveBeenCalledTimes(2);
    await expect(bearer.json()).resolves.toEqual({ actor: "user-1" });
  });

  it("rejects missing, invalid, and malformed resolver actors before the operation", async () => {
    const { app, operation } = createApp(async () => ({ userId: "" }));

    const response = await app.request("/protected");

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ error: { code: "UNAUTHENTICATED" } });
    expect(operation).not.toHaveBeenCalled();
  });

  it("maps resolver outages to a private, sanitized 503 before the operation", async () => {
    const { app, operation } = createApp(async () => {
      throw new Error("Better Auth database unavailable");
    });

    const response = await app.request("/protected");
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toContain("SERVICE_UNAVAILABLE");
    expect(body).not.toContain("database unavailable");
    expect(operation).not.toHaveBeenCalled();
  });
});
