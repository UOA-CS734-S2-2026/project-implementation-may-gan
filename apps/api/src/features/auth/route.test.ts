import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../app";
import {
  createBetterAuthCompatibilitySlice,
  readBetterAuthRuntimeConfiguration,
  withHyperdriveDatabase,
} from "./better-auth";
import type { DayliDatabaseClient } from "@dayli/db";

const origin = "https://worker.test";

function createCompatibilityApp(sessionExpiresIn?: number) {
  const auth = createBetterAuthCompatibilitySlice({
    baseURL: origin,
    secret: `${crypto.randomUUID()}${crypto.randomUUID()}`,
    database: { account: [], session: [], user: [], verification: [] },
    sessionExpiresIn,
  });

  return createApp(auth);
}

function request(path: string, init: RequestInit = {}, requestOrigin = origin) {
  const headers = new Headers(init.headers);
  headers.set("origin", requestOrigin);

  return new Request(`${origin}${path}`, { ...init, headers });
}

function sessionCookie(response: Response) {
  const setCookie = response.headers.get("set-cookie");
  expect(setCookie).not.toBeNull();
  return setCookie!.split(";", 1)[0];
}

function nativeToken(response: Response) {
  const token = response.headers.get("set-auth-token");
  expect(token).toBeTruthy();
  return token!;
}

async function signUp(app: ReturnType<typeof createCompatibilityApp>) {
  return app.fetch(
    request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Compatibility User",
        email: "compatibility@example.test",
        password: "not-a-real-password",
      }),
    }),
  );
}

async function signIn(app: ReturnType<typeof createCompatibilityApp>) {
  return app.fetch(
    request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "compatibility@example.test",
        password: "not-a-real-password",
      }),
    }),
  );
}

describe("Better Auth compatibility route", () => {
  it("requires complete production-style bindings before PostgreSQL auth can mount", () => {
    const bindings = {
      HYPERDRIVE: { connectionString: "postgresql://app:app@localhost:5433/dayli_test" },
      BETTER_AUTH_SECRET: "test-only-better-auth-secret-that-is-at-least-32-characters",
      BETTER_AUTH_BASE_URL: origin,
      BETTER_AUTH_TRUSTED_ORIGINS: `${origin},https://web.example.test`,
    };

    expect(readBetterAuthRuntimeConfiguration(bindings)).toMatchObject({
      baseURL: origin,
      trustedOrigins: [origin, "https://web.example.test"],
    });
    expect(readBetterAuthRuntimeConfiguration({ ...bindings, BETTER_AUTH_SECRET: "too-short" })).toBeUndefined();
    expect(readBetterAuthRuntimeConfiguration({ ...bindings, BETTER_AUTH_TRUSTED_ORIGINS: "https://web.example.test" })).toBeUndefined();
  });

  it("answers allowed credentialed preflight requests and rejects disallowed origins", async () => {
    const app = createCompatibilityApp();
    const preflight = await app.fetch(request("/api/auth/sign-in/email", {
      method: "OPTIONS",
      headers: {
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type, authorization",
      },
    }));

    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(origin);
    expect(preflight.headers.get("access-control-allow-credentials")).toBe("true");
    expect(preflight.headers.get("access-control-allow-methods")).toContain("POST");
    expect(preflight.headers.get("access-control-allow-headers")).toContain("authorization");
    expect(preflight.headers.get("access-control-expose-headers")).toContain("set-auth-token");

    const denied = await app.fetch(request("/api/auth/sign-in/email", {
      method: "OPTIONS",
      headers: { "access-control-request-method": "POST" },
    }, "https://untrusted.example.test"));
    expect(denied.status).toBe(403);
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("creates a secure browser session and accepts its signed native bearer handoff", async () => {
    const app = createCompatibilityApp();
    const signUpResponse = await signUp(app);
    const cookie = sessionCookie(signUpResponse);
    const token = nativeToken(signUpResponse);

    expect(signUpResponse.status).toBe(200);
    expect(signUpResponse.headers.get("set-cookie")).toContain("HttpOnly");
    expect(signUpResponse.headers.get("set-cookie")).toContain("Secure");
    expect(signUpResponse.headers.get("set-cookie")).toContain("SameSite=Lax");
    expect(signUpResponse.headers.get("access-control-expose-headers")).toContain("set-auth-token");
    expect(signUpResponse.headers.get("access-control-allow-origin")).toBe(origin);
    expect(signUpResponse.headers.get("access-control-allow-credentials")).toBe("true");

    const browserSession = await app.fetch(
      request("/api/auth/get-session", { headers: { cookie } }),
    );
    const nativeSession = await app.fetch(
      request("/api/auth/get-session", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    await expect(browserSession.json()).resolves.toMatchObject({
      user: { email: "compatibility@example.test" },
    });
    await expect(nativeSession.json()).resolves.toMatchObject({
      user: { email: "compatibility@example.test" },
    });
  });

  it("keeps ordinary requests without an Origin header working without CORS headers", async () => {
    const app = createCompatibilityApp();
    const token = nativeToken(await signUp(app));
    const response = await app.fetch(new Request(`${origin}/api/auth/get-session`, {
      headers: { authorization: `Bearer ${token}` },
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    await expect(response.json()).resolves.toMatchObject({ user: { email: "compatibility@example.test" } });
  });

  it("closes Hyperdrive clients after successful and failing operations", async () => {
    const close = vi.fn(async () => undefined);
    const createDatabase = vi.fn(() => ({
      db: {} as DayliDatabaseClient["db"],
      client: {} as DayliDatabaseClient["client"],
      close,
    }));
    const binding = { connectionString: "postgresql://app:app@localhost:5433/dayli_test" };

    await expect(withHyperdriveDatabase(binding, async () => "ok", createDatabase)).resolves.toBe("ok");
    await expect(withHyperdriveDatabase(binding, async () => {
      throw new Error("failure");
    }, createDatabase)).rejects.toThrow("failure");
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("rejects state-changing browser requests from an untrusted origin", async () => {
    const app = createCompatibilityApp();
    const response = await app.fetch(
      request(
        "/api/auth/sign-up/email",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: "Untrusted Origin",
            email: "untrusted@example.test",
            password: "not-a-real-password",
          }),
        },
        "https://untrusted.example.test",
      ),
    );

    expect(response.status).toBe(403);
  });

  it("rejects an invalid bearer token", async () => {
    const app = createCompatibilityApp();
    const response = await app.fetch(
      request("/api/auth/get-session", {
        headers: { authorization: "Bearer invalid-token" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toBeNull();
  });

  it("expires sessions in the Worker runtime", async () => {
    vi.useFakeTimers();
    try {
      const app = createCompatibilityApp(1);
      const signUpResponse = await signUp(app);
      const token = nativeToken(signUpResponse);

      await vi.advanceTimersByTimeAsync(1001);
      const response = await app.fetch(
        request("/api/auth/get-session", {
          headers: { authorization: `Bearer ${token}` },
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("logs out the current bearer session and revokes every remaining session", async () => {
    const app = createCompatibilityApp();
    const firstSignIn = await signUp(app);
    const firstToken = nativeToken(firstSignIn);
    const secondSignIn = await signIn(app);
    const secondToken = nativeToken(secondSignIn);

    const logout = await app.fetch(
      request("/api/auth/sign-out", {
        method: "POST",
        headers: { authorization: `Bearer ${firstToken}` },
      }),
    );
    expect(logout.status).toBe(200);

    const loggedOutSession = await app.fetch(
      request("/api/auth/get-session", {
        headers: { authorization: `Bearer ${firstToken}` },
      }),
    );
    await expect(loggedOutSession.json()).resolves.toBeNull();

    const revokeAll = await app.fetch(
      request("/api/auth/revoke-sessions", {
        method: "POST",
        headers: { authorization: `Bearer ${secondToken}` },
      }),
    );
    expect(revokeAll.status).toBe(200);

    const revokedSession = await app.fetch(
      request("/api/auth/get-session", {
        headers: { authorization: `Bearer ${secondToken}` },
      }),
    );
    await expect(revokedSession.json()).resolves.toBeNull();
  });
});
