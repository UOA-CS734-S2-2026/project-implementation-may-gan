import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../../app";
import type { RemoveAvatarRepository } from "../remove-avatar.repository";
import type { RemoveAvatarRouteDependencies } from "../remove-avatar.route";

const fixedNow = new Date("2026-09-30T03:00:00.000Z");

function dependencies(removeAvatar?: RemoveAvatarRepository["removeAvatar"]): RemoveAvatarRouteDependencies {
  return {
    resolveSession: async (request) => {
      const header = request.headers.get("authorization");
      return header?.startsWith("Bearer user-") ? { userId: header.slice("Bearer ".length) } : null;
    },
    repository: removeAvatar ? { removeAvatar } : undefined,
    now: () => fixedNow,
  };
}

function remove(deps: RemoveAvatarRouteDependencies, user: string | null = "user-me") {
  return createApp({ avatarRemove: deps }).request("/api/v1/profile/avatar", {
    method: "DELETE",
    headers: user ? { authorization: `Bearer ${user}` } : {},
  });
}

describe("DELETE /api/v1/profile/avatar", () => {
  it("requires a session", async () => {
    const removeAvatar = vi.fn();
    expect((await remove(dependencies(removeAvatar), null)).status).toBe(401);
    expect(removeAvatar).not.toHaveBeenCalled();
  });

  it("removes the actor's photo", async () => {
    const removeAvatar = vi.fn<RemoveAvatarRepository["removeAvatar"]>(async () => ({
      kind: "removed",
      profile: { id: "user-me", username: "me", displayName: "Me", detailsVisible: true, bio: null, mbti: null, whatIDo: null, listeningTo: null, avatarUrl: null, streak: null, stats: null, owner: { profileVisibility: "public", usernameChangeAvailableAt: null } },
    }));
    const response = await remove(dependencies(removeAvatar));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ avatarUrl: null });
    expect(removeAvatar).toHaveBeenCalledWith("user-me", fixedNow);
  });

  it("does not add a session check to setting a photo", async () => {
    const resolveSession = vi.fn(async () => ({ userId: "user-me" }));
    await createApp({
      avatarRemove: { ...dependencies(vi.fn()), resolveSession },
      avatarSet: { resolveSession, repository: { setAvatar: async () => ({ kind: "notFound" }) } },
    }).request("/api/v1/profile/avatar", {
      method: "PUT",
      headers: { authorization: "Bearer user-me", "content-type": "application/json" },
      body: JSON.stringify({ reservationId: "res-1" }),
    });

    expect(resolveSession).toHaveBeenCalledTimes(1);
  });
});
