import type { DayliDatabase } from "@dayli/db";
import { describe, expect, it, vi } from "vitest";
import { createPostgresFeedRepository, InvalidFeedCursorError } from "./list-feed.repository";

function cursor(value: unknown): string {
  return btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** Cursors are decoded before any query, so a bad one never reaches PostgreSQL. */
describe("feed cursor", () => {
  const select = vi.fn();
  const feed = createPostgresFeedRepository({ select } as unknown as DayliDatabase);
  const now = new Date("2026-09-26T03:00:00.000Z");

  it.each([
    ["an unreadable value", "not-a-cursor"],
    ["an impossible month and day", cursor(["2026-99-99", "post-1"])],
    ["a day past the end of the month", cursor(["2026-02-30", "post-1"])],
    ["a year PostgreSQL cannot store", cursor(["0000-01-01", "post-1"])],
    ["a missing id", cursor(["2026-09-25", ""])],
    ["the wrong shape", cursor({ localDate: "2026-09-25", id: "post-1" })],
  ])("rejects %s", async (_name, value) => {
    await expect(feed.listFeed("user-viewer", now, 20, value)).rejects.toBeInstanceOf(InvalidFeedCursorError);
    expect(select).not.toHaveBeenCalled();
  });
});
