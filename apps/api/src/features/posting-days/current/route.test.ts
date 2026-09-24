import { describe, expect, it, vi } from "vitest";
import { createAucklandDayService } from "@dayli/domain";
import { createBetterAuthCompatibilitySlice } from "../../auth/better-auth";
import { createApp } from "../../../app";
import { createCurrentPostingDayService, type DailyPromptRepository } from "./service";
import type { CurrentPostingDayRouteDependencies } from "./route";

const fixedNow = new Date("2028-02-29T10:00:00.000Z");

function createDependencies(
  overrides: Partial<CurrentPostingDayRouteDependencies> = {},
  promptRepository: DailyPromptRepository = {
    findActivePrompt: async () => ({
      id: "prompt-02-29",
      text: "What made you smile today?",
      version: 1,
      effectiveDate: "1970-01-01",
    }),
  },
) {
  const clock = { now: () => fixedNow };
  return {
    authenticate: async (request: Request) => request.headers.get("authorization") === "Bearer test-token" ? "user-1" : null,
    service: createCurrentPostingDayService({
      clock,
      dayService: createAucklandDayService(clock),
      prompts: promptRepository,
      hasPosted: async (userId, localDate) => userId.length > 0 && localDate === "2028-02-29",
      onOperationalAlert: vi.fn(),
    }),
    ...overrides,
  } satisfies CurrentPostingDayRouteDependencies;
}

describe("GET /api/v1/posting-days/current", () => {
  it("requires a session and never permits caching", async () => {
    const response = await createApp(undefined, createDependencies()).request("/api/v1/posting-days/current");
    const body = await response.json<{ error: { code: string } }>();

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("uses the authenticated user and server Auckland day", async () => {
    const response = await createApp(undefined, createDependencies()).request(
      "/api/v1/posting-days/current",
      { headers: { authorization: "Bearer test-token" } },
    );
    const body = await response.json<{
      serverNow: string;
      localDate: string;
      deadlineAt: string;
      releaseAt: string;
      prompt: { id: string; text: string };
      hasPosted: boolean;
    }>();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({
      serverNow: "2028-02-29T10:00:00.000Z",
      localDate: "2028-02-29",
      deadlineAt: "2028-02-29T11:00:00.000Z",
      releaseAt: "2028-02-29T11:00:00.000Z",
      prompt: { id: "prompt-02-29", text: "What made you smile today?" },
      hasPosted: true,
    });
  });

  it("accepts a real Better Auth session and marks the response no-store", async () => {
    const auth = createBetterAuthCompatibilitySlice({
      baseURL: "https://worker.test",
      secret: `${crypto.randomUUID()}${crypto.randomUUID()}`,
      database: { account: [], session: [], user: [], verification: [] },
    });
    const authApp = createApp(auth, {
      authenticate: async (request) => {
        const session = await auth.auth.api.getSession({ headers: request.headers });
        return session?.user.id ?? null;
      },
      service: createDependencies().service,
    });
    const signedUp = await authApp.fetch(new Request("https://worker.test/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Test User", email: "posting-day@example.test", password: "not-a-real-password" }),
    }));
    const token = signedUp.headers.get("set-auth-token");
    expect(signedUp.status).toBe(200);
    expect(token).toBeTruthy();

    const response = await authApp.fetch(new Request("https://worker.test/api/v1/posting-days/current", {
      headers: { authorization: `Bearer ${token}` },
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ hasPosted: true });
  });

  it("returns a temporary error instead of inventing hasPosted", async () => {
    const clock = { now: () => fixedNow };
    const service = createCurrentPostingDayService({
      clock,
      dayService: createAucklandDayService(clock),
      prompts: {
        findActivePrompt: async () => ({ id: "prompt-02-29", text: "Prompt", version: 1, effectiveDate: "1970-01-01" }),
      },
      onOperationalAlert: vi.fn(),
    });
    const response = await createApp(undefined, createDependencies({ service })).request(
      "/api/v1/posting-days/current",
      { headers: { authorization: "Bearer test-token" } },
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ error: { code: "SERVICE_UNAVAILABLE" } });
  });

  it("alerts without private content when the scheduled prompt is missing", async () => {
    const alert = vi.fn();
    const promptRepository: DailyPromptRepository = { findActivePrompt: async () => null };
    const clock = { now: () => fixedNow };
    const service = createCurrentPostingDayService({
      clock,
      dayService: createAucklandDayService(clock),
      prompts: promptRepository,
      onOperationalAlert: alert,
      hasPosted: async () => false,
    });

    const response = await createApp(undefined, createDependencies({ service })).request(
      "/api/v1/posting-days/current",
      { headers: { authorization: "Bearer test-token" } },
    );

    expect(response.status).toBe(503);
    expect(alert).toHaveBeenCalledWith({
      code: "MISSING_DAILY_PROMPT",
      localDate: "2028-02-29",
      monthDay: "02-29",
    });
    expect(JSON.stringify(alert.mock.calls)).not.toContain("user-1");
  });
});
