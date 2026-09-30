import type { DayliDatabase } from "@dayli/db";
import { describe, expect, it, vi } from "vitest";
import { InvalidPostCursorError } from "../shared/post-page-cursor";
import { createPostgresFeedRepository } from "./list-feed.repository";

/** Cursors are decoded before any query, so a bad one never reaches PostgreSQL. */
describe("feed cursor", () => {
  it("rejects an unreadable cursor without querying", async () => {
    const select = vi.fn();
    const feed = createPostgresFeedRepository({ select } as unknown as DayliDatabase);

    await expect(feed.listFeed("user-viewer", new Date(), 20, "not-a-cursor")).rejects.toBeInstanceOf(InvalidPostCursorError);
    expect(select).not.toHaveBeenCalled();
  });
});
