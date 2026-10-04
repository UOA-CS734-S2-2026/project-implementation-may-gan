import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../../app";
import type { ProfileDetails } from "../../shared/profile-details.contract";
import type { SetAvatarRepository } from "../set-avatar.repository";
import type { SetAvatarRouteDependencies } from "../set-avatar.route";

const fixedNow = new Date("2026-09-30T03:00:00.000Z");
const profile: ProfileDetails = {
  id: "user-me",
  username: "me",
  displayName: "Me",
  detailsVisible: true,
  bio: null,
  mbti: null,
  whatIDo: null,
  listeningTo: null,
  avatarUrl: "https://r2.example.test/photo?signed",
  streak: null,
  stats: null,
  owner: { profileVisibility: "public", usernameChangeAvailableAt: null },
};

function dependencies(setAvatar?: SetAvatarRepository["setAvatar"]): SetAvatarRouteDependencies {
  return {
    resolveSession: async (request) => {
      const header = request.headers.get("authorization");
      return header?.startsWith("Bearer user-") ? { userId: header.slice("Bearer ".length) } : null;
    },
    repository: setAvatar ? { setAvatar } : undefined,
    now: () => fixedNow,
  };
}

function put(deps: SetAvatarRouteDependencies, body: unknown, user: string | null = "user-me") {
  return createApp({ avatarSet: deps }).request("/api/v1/profile/avatar", {
    method: "PUT",
    headers: { "content-type": "application/json", ...(user ? { authorization: `Bearer ${user}` } : {}) },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/v1/profile/avatar", () => {
  it("requires a session", async () => {
    const setAvatar = vi.fn();
    expect((await put(dependencies(setAvatar), { reservationId: "res-1" }, null)).status).toBe(401);
    expect(setAvatar).not.toHaveBeenCalled();
  });

  it("sets the actor's own upload as their photo", async () => {
    const setAvatar = vi.fn<SetAvatarRepository["setAvatar"]>(async () => ({ kind: "set", profile }));
    const response = await put(dependencies(setAvatar), { reservationId: "res-1" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(profile);
    expect(setAvatar).toHaveBeenCalledWith("user-me", "res-1", fixedNow);
  });

  it.each([
    ["notFound", 404, undefined],
    ["notReady", 409, "notReady"],
    ["notImage", 409, "notImage"],
  ] as const)("maps %s", async (kind, status, reason) => {
    const response = await put(dependencies(async () => ({ kind })), { reservationId: "res-1" });

    expect(response.status).toBe(status);
    if (reason) await expect(response.json()).resolves.toMatchObject({ error: { details: { reason } } });
  });

  it("rejects a missing reservation ID", async () => {
    const setAvatar = vi.fn();
    expect((await put(dependencies(setAvatar), {})).status).toBe(422);
    expect(setAvatar).not.toHaveBeenCalled();
  });

  it("is unavailable without storage", async () => {
    expect((await put(dependencies(), { reservationId: "res-1" })).status).toBe(503);
  });
});
