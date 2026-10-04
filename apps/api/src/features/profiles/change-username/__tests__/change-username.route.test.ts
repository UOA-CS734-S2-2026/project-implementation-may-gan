import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../../app";
import type { ChangeUsernameRepository } from "../change-username.repository";
import type { ChangeUsernameRouteDependencies } from "../change-username.route";

const fixedNow = new Date("2026-09-30T03:00:00.000Z");
const availableAt = new Date("2026-10-30T03:00:00.000Z");

function dependencies(changeUsername?: ChangeUsernameRepository["changeUsername"]): ChangeUsernameRouteDependencies {
  return {
    resolveSession: async (request) => {
      const header = request.headers.get("authorization");
      return header?.startsWith("Bearer user-") ? { userId: header.slice("Bearer ".length) } : null;
    },
    repository: changeUsername ? { changeUsername } : undefined,
    now: () => fixedNow,
  };
}

function put(deps: ChangeUsernameRouteDependencies, body: unknown, user: string | null = "user-me") {
  return createApp({ usernameChange: deps }).request("/api/v1/profile/username", {
    method: "PUT",
    headers: { "content-type": "application/json", ...(user ? { authorization: `Bearer ${user}` } : {}) },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/v1/profile/username", () => {
  it("requires a session", async () => {
    const changeUsername = vi.fn();
    expect((await put(dependencies(changeUsername), { username: "new_me" }, null)).status).toBe(401);
    expect(changeUsername).not.toHaveBeenCalled();
  });

  it("changes the actor's handle, lower-cased", async () => {
    const changeUsername = vi.fn<ChangeUsernameRepository["changeUsername"]>(async () => ({ kind: "changed", username: "new_me", availableAt }));
    const response = await put(dependencies(changeUsername), { username: " New_Me " });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ username: "new_me", usernameChangeAvailableAt: availableAt.toISOString() });
    expect(changeUsername).toHaveBeenCalledWith("user-me", "new_me", fixedNow);
  });

  it("says when the next change is allowed", async () => {
    const response = await put(dependencies(async () => ({ kind: "tooSoon", availableAt })), { username: "new_me" });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { details: { reason: "tooSoon", availableAt: availableAt.toISOString() } } });
  });

  it("reports a taken handle", async () => {
    const response = await put(dependencies(async () => ({ kind: "taken" })), { username: "ben" });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { details: { reason: "taken" } } });
  });

  it.each(["ab", "has space", "-dash", "x".repeat(31)])("rejects %s", async (username) => {
    const changeUsername = vi.fn();
    expect((await put(dependencies(changeUsername), { username })).status).toBe(422);
    expect(changeUsername).not.toHaveBeenCalled();
  });

  it("leaves the initial username setup routes with a single session check", async () => {
    const resolveSession = vi.fn(async () => ({ userId: "user-me" }));
    const response = await createApp({
      usernameProfile: { resolveSession, store: { get: async () => ({ username: "me", publicName: null, needsUsernameSetup: false }), claimInitial: vi.fn() } },
      usernameChange: { ...dependencies(vi.fn()), resolveSession },
    }).request("/api/v1/profile/username", { headers: { authorization: "Bearer user-me" } });

    expect(response.status).toBe(200);
    expect(resolveSession).toHaveBeenCalledTimes(1);
  });
});
