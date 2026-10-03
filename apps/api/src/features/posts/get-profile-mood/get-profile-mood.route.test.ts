import { summarizeMoodHistory } from "@dayli/domain";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../app";
import type { ProfileMoodOutcome, ProfileMoodRepository } from "./get-profile-mood.repository";
import type { GetProfileMoodRouteDependencies } from "./get-profile-mood.route";

const fixedNow = new Date("2026-09-30T03:00:00.000Z");
const history = summarizeMoodHistory("30d", "2026-09-30", "2026-09-01", [
  { localDate: "2026-09-28", rating: 8 },
  { localDate: "2026-09-29", rating: 6 },
], ["2026-09-20"]);
const found: ProfileMoodOutcome = { kind: "found", history };

function dependencies(findProfileMood?: ProfileMoodRepository["findProfileMood"]): GetProfileMoodRouteDependencies {
  return {
    resolveSession: async (request) => {
      const header = request.headers.get("authorization");
      return header?.startsWith("Bearer user-") ? { userId: header.slice("Bearer ".length) } : null;
    },
    repository: findProfileMood ? { findProfileMood } : undefined,
    now: () => fixedNow,
  };
}

function get(deps: GetProfileMoodRouteDependencies, path = "/api/v1/profiles/ben/mood", user: string | null = "user-viewer") {
  return createApp({ profileMood: deps }).request(path, { headers: user ? { authorization: `Bearer ${user}` } : {} });
}

describe("GET /api/v1/profiles/{username}/mood", () => {
  it("requires a session", async () => {
    const findProfileMood = vi.fn();
    const response = await get(dependencies(findProfileMood), undefined, null);

    expect(response.status).toBe(401);
    expect(findProfileMood).not.toHaveBeenCalled();
  });

  it("reads the profile's history for the verified actor over 30 days by default", async () => {
    const findProfileMood = vi.fn(async () => found);
    const response = await get(dependencies(findProfileMood));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(history);
    expect(findProfileMood).toHaveBeenCalledWith("user-viewer", "ben", "30d", fixedNow);
  });

  it("accepts the longer ranges and rejects anything else", async () => {
    const findProfileMood = vi.fn(async () => found);
    expect((await get(dependencies(findProfileMood), "/api/v1/profiles/ben/mood?range=1y")).status).toBe(200);
    expect(findProfileMood).toHaveBeenLastCalledWith("user-viewer", "ben", "1y", fixedNow);

    expect((await get(dependencies(findProfileMood), "/api/v1/profiles/ben/mood?range=7d")).status).toBe(422);
    expect((await get(dependencies(findProfileMood), "/api/v1/profiles/no%20spaces/mood")).status).toBe(422);
    expect(findProfileMood).toHaveBeenCalledTimes(1);
  });

  it("is forbidden to anyone but the owner and friends, and hides unknown profiles", async () => {
    expect((await get(dependencies(async () => ({ kind: "forbidden" })))).status).toBe(403);
    expect((await get(dependencies(async () => ({ kind: "notFound" })))).status).toBe(404);
  });

  it("does not claim the profile or posts paths", async () => {
    const findProfileMood = vi.fn(async () => found);
    await get(dependencies(findProfileMood), "/api/v1/profiles/ben/posts");
    await get(dependencies(findProfileMood), "/api/v1/profiles/ben");

    expect(findProfileMood).not.toHaveBeenCalled();
  });

  it("conceals storage failures", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await get(dependencies(async () => { throw new Error("relation \"posts\" does not exist"); }));

    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("relation");
    error.mockRestore();
  });

  it("is unavailable without storage", async () => {
    expect((await get(dependencies())).status).toBe(503);
  });
});
