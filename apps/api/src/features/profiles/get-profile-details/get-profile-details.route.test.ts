import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../app";
import type { ProfileDetails, ReadableProfile } from "../shared/profile-details.contract";
import type { ProfileDetailsRepository } from "./get-profile-details.repository";
import type { GetProfileDetailsRouteDependencies } from "./get-profile-details.route";

const fixedNow = new Date("2026-09-30T03:00:00.000Z");
const profile: ProfileDetails = {
  id: "user-ben",
  username: "ben",
  displayName: "Ben",
  detailsVisible: true,
  bio: "Bakes bread.",
  mbti: null,
  whatIDo: null,
  listeningTo: null,
  avatarUrl: null,
  streak: { current: 3, longest: 5, lastPostDate: "2026-09-30", postedToday: true, asOf: "2026-09-30" },
  stats: { posts: 12, friends: 4, loved: 0 },
  owner: null,
};

function dependencies(findProfile?: ProfileDetailsRepository["findProfile"]): GetProfileDetailsRouteDependencies {
  return {
    resolveSession: async (request) => {
      const header = request.headers.get("authorization");
      return header?.startsWith("Bearer user-") ? { userId: header.slice("Bearer ".length) } : null;
    },
    repository: findProfile ? { findProfile } : undefined,
    now: () => fixedNow,
  };
}

function get(deps: GetProfileDetailsRouteDependencies, path = "/api/v1/profiles/ben", user: string | null = "user-viewer") {
  return createApp({ profileDetails: deps }).request(path, { headers: user ? { authorization: `Bearer ${user}` } : {} });
}

describe("GET /api/v1/profiles/{username}", () => {
  it("allows an anonymous read and passes no actor identity", async () => {
    const findProfile = vi.fn(async (): Promise<ReadableProfile> => ({
      kind: "public",
      username: "ben",
      displayName: "Ben",
      bio: "Bakes bread.",
      avatarUrl: null,
      streak: profile.streak,
    }));
    const response = await get(dependencies(findProfile), undefined, null);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ kind: "public", username: "ben" });
    expect(findProfile).toHaveBeenCalledWith(null, "ben", fixedNow);
  });

  it("rejects invalid presented credentials instead of treating them as anonymous", async () => {
    const findProfile = vi.fn();
    const response = await createApp({ profileDetails: dependencies(findProfile) }).request(
      "/api/v1/profiles/ben",
      { headers: { authorization: "Bearer invalid" } },
    );

    expect(response.status).toBe(401);
    expect(findProfile).not.toHaveBeenCalled();
  });

  it("reads the profile for the verified actor", async () => {
    const readable = { kind: "authorized" as const, ...profile };
    const findProfile = vi.fn(async () => readable);
    const response = await get(dependencies(findProfile));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(readable);
    expect(findProfile).toHaveBeenCalledWith("user-viewer", "ben", fixedNow);
  });

  it("returns the exact minimal restricted contract without profile metadata", async () => {
    const findProfile = vi.fn(async (): Promise<ReadableProfile> => ({ kind: "restricted", username: "ben" }));
    const response = await get(dependencies(findProfile), undefined, null);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ kind: "restricted", username: "ben" });
  });

  it("does not claim the posts path", async () => {
    const findProfile = vi.fn(async () => ({ kind: "authorized" as const, ...profile }));
    await get(dependencies(findProfile), "/api/v1/profiles/ben/posts");

    expect(findProfile).not.toHaveBeenCalled();
  });

  it("is not found for a hidden profile and rejects a malformed handle", async () => {
    expect((await get(dependencies(async () => null))).status).toBe(404);
    expect((await get(dependencies(vi.fn()), "/api/v1/profiles/no%20spaces")).status).toBe(422);
  });

  it("conceals storage failures", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await get(dependencies(async () => { throw new Error("relation \"user\" does not exist"); }));

    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("relation");
    error.mockRestore();
  });
});
