import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../app";
import type { ProfileDetails } from "../shared/profile-details.contract";
import type { UpdateProfileRepository } from "./update-profile.repository";
import type { UpdateProfileRouteDependencies } from "./update-profile.route";

const fixedNow = new Date("2026-09-30T03:00:00.000Z");
const profile: ProfileDetails = {
  id: "user-me",
  username: "me",
  displayName: "Me",
  detailsVisible: true,
  bio: "New bio",
  streak: null,
  owner: { profileVisibility: "private", usernameChangeAvailableAt: null },
};

function dependencies(updateProfile?: UpdateProfileRepository["updateProfile"]): UpdateProfileRouteDependencies {
  return {
    resolveSession: async (request) => {
      const header = request.headers.get("authorization");
      return header?.startsWith("Bearer user-") ? { userId: header.slice("Bearer ".length) } : null;
    },
    repository: updateProfile ? { updateProfile } : undefined,
    now: () => fixedNow,
  };
}

function patch(deps: UpdateProfileRouteDependencies, body: unknown, user: string | null = "user-me") {
  return createApp({ profileUpdate: deps }).request("/api/v1/profile", {
    method: "PATCH",
    headers: { "content-type": "application/json", ...(user ? { authorization: `Bearer ${user}` } : {}) },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/v1/profile", () => {
  it("requires a session", async () => {
    const updateProfile = vi.fn();
    expect((await patch(dependencies(updateProfile), { bio: "x" }, null)).status).toBe(401);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("updates only the actor's own profile, clearing blank fields", async () => {
    const updateProfile = vi.fn<UpdateProfileRepository["updateProfile"]>(async () => ({ kind: "updated", profile }));
    const response = await patch(dependencies(updateProfile), { bio: "  New bio  ", publicName: "  ", profileVisibility: "private" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(profile);
    expect(updateProfile).toHaveBeenCalledWith("user-me", { bio: "New bio", publicName: null, profileVisibility: "private" }, fixedNow);
  });

  it.each([
    ["an empty body", {}],
    ["a bio over 160 characters", { bio: "x".repeat(161) }],
    ["a public name over 80 characters", { publicName: "x".repeat(81) }],
    ["an unknown visibility", { profileVisibility: "friends" }],
  ])("rejects %s", async (_name, body) => {
    const updateProfile = vi.fn();
    expect((await patch(dependencies(updateProfile), body)).status).toBe(422);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("asks for a username first", async () => {
    const response = await patch(dependencies(async () => ({ kind: "needsUsername" })), { bio: "x" });

    expect(response.status).toBe(409);
  });
});
