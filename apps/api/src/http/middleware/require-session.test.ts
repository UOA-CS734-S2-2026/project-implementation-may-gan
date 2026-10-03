import { Hono } from "hono";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { AuthenticatedActor, AuthenticatedApiEnv, OptionalAuthenticatedApiEnv } from "../authenticated-actor";
import { createOptionalSession, createRequireSession } from "./require-session";

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

describe("createOptionalSession", () => {
  it("types the actor as nullable in optional-session routes", () => {
    expectTypeOf<OptionalAuthenticatedApiEnv["Variables"]["actor"]>()
      .toEqualTypeOf<AuthenticatedActor | null>();
  });

  function createOptionalApp(resolveSession: Parameters<typeof createOptionalSession>[0]) {
    const app = new Hono<OptionalAuthenticatedApiEnv>();
    const operation = vi.fn((actor: string | null) => ({ actor }));
    app.use("/public-read", createOptionalSession(resolveSession));
    app.get("/public-read", (context) => context.json(operation(context.get("actor")?.userId ?? null)));
    return { app, operation };
  }

  it("does not contact the resolver when credentials are absent", async () => {
    const resolveSession = vi.fn(async () => { throw new Error("must not resolve"); });
    const { app, operation } = createOptionalApp(resolveSession);

    const response = await app.request("/public-read");

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ actor: null });
    expect(resolveSession).not.toHaveBeenCalled();
    expect(operation).toHaveBeenCalledWith(null);
  });

  it.each([
    ["bearer", { authorization: "Bearer invalid" }],
    ["secure cookie", { cookie: "__Secure-better-auth.session_token=invalid" }],
    ["host cookie", { cookie: "__Host-better-auth.session_token=invalid" }],
  ])("rejects an invalid %s credential instead of using anonymous access", async (_name, headers) => {
    const { app, operation } = createOptionalApp(async () => null);

    const response = await app.request("/public-read", { headers });

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(operation).not.toHaveBeenCalled();
  });

  it("sets a verified actor and keeps resolver outages private", async () => {
    const verified = createOptionalApp(async () => ({ userId: "user-1" }));
    const success = await verified.app.request("/public-read", { headers: { authorization: "Bearer valid" } });
    await expect(success.json()).resolves.toEqual({ actor: "user-1" });

    const unavailable = createOptionalApp(async () => { throw new Error("database unavailable"); });
    const failure = await unavailable.app.request("/public-read", { headers: { authorization: "Bearer valid" } });
    expect(failure.status).toBe(503);
    expect(await failure.text()).not.toContain("database unavailable");
    expect(unavailable.operation).not.toHaveBeenCalled();
  });
});
