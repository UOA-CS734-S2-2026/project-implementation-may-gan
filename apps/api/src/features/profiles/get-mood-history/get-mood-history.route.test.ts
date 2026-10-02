import { summarizeMoodHistory } from "@dayli/domain";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../app";
import type { MoodHistoryRepository } from "./get-mood-history.repository";
import type { GetMoodHistoryRouteDependencies } from "./get-mood-history.route";

const fixedNow = new Date("2026-09-30T03:00:00.000Z");
const history = summarizeMoodHistory("30d", "2026-09-30", "2026-09-01", [
  { localDate: "2026-09-28", rating: 8 },
  { localDate: "2026-09-29", rating: 6 },
]);

function dependencies(findMoodHistory?: MoodHistoryRepository["findMoodHistory"]): GetMoodHistoryRouteDependencies {
  return {
    resolveSession: async (request) => {
      const header = request.headers.get("authorization");
      return header?.startsWith("Bearer user-") ? { userId: header.slice("Bearer ".length) } : null;
    },
    repository: findMoodHistory ? { findMoodHistory } : undefined,
    now: () => fixedNow,
  };
}

function get(deps: GetMoodHistoryRouteDependencies, path = "/api/v1/profile/mood", user: string | null = "user-owner") {
  return createApp({ moodHistory: deps }).request(path, { headers: user ? { authorization: `Bearer ${user}` } : {} });
}

describe("GET /api/v1/profile/mood", () => {
  it("requires a session", async () => {
    const findMoodHistory = vi.fn();
    const response = await get(dependencies(findMoodHistory), undefined, null);

    expect(response.status).toBe(401);
    expect(findMoodHistory).not.toHaveBeenCalled();
  });

  it("reads the verified actor's own history over 30 days by default", async () => {
    const findMoodHistory = vi.fn(async () => history);
    const response = await get(dependencies(findMoodHistory));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(history);
    expect(findMoodHistory).toHaveBeenCalledWith("user-owner", "30d", fixedNow);
  });

  it("accepts the longer ranges and rejects anything else", async () => {
    const findMoodHistory = vi.fn(async () => history);
    expect((await get(dependencies(findMoodHistory), "/api/v1/profile/mood?range=1y")).status).toBe(200);
    expect(findMoodHistory).toHaveBeenLastCalledWith("user-owner", "1y", fixedNow);

    const rejected = await get(dependencies(findMoodHistory), "/api/v1/profile/mood?range=7d");
    expect(rejected.status).toBe(422);
    expect(findMoodHistory).toHaveBeenCalledTimes(1);
  });

  it("treats a vanished account as signed out", async () => {
    expect((await get(dependencies(async () => null))).status).toBe(401);
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
