import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { afterPostCursor, decodePostCursor, encodePostCursor, InvalidPostCursorError } from "./post-page-cursor";

function cursor(value: unknown): string {
  return btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

describe("post page cursor", () => {
  it("round-trips the last post of a page", () => {
    const last = { localDate: "2026-09-25", id: "post-1" };
    expect(decodePostCursor(encodePostCursor(last))).toEqual(last);
  });

  it("treats a missing cursor as the first page", () => {
    expect(decodePostCursor(undefined)).toBeUndefined();
    expect(afterPostCursor(undefined)).toBeUndefined();
  });

  it.each([
    ["an unreadable value", "not-a-cursor"],
    ["an impossible month and day", cursor(["2026-99-99", "post-1"])],
    ["a day past the end of the month", cursor(["2026-02-30", "post-1"])],
    ["a year PostgreSQL cannot store", cursor(["0000-01-01", "post-1"])],
    ["a missing id", cursor(["2026-09-25", ""])],
    ["the wrong shape", cursor({ localDate: "2026-09-25", id: "post-1" })],
  ])("rejects %s", (_name, value) => {
    expect(() => decodePostCursor(value)).toThrow(InvalidPostCursorError);
  });

  it("continues strictly after the cursor day and id", () => {
    const query = new PgDialect().sqlToQuery(afterPostCursor({ localDate: "2026-09-25", id: "post-1" })!);

    expect(query.sql).toBe('("posts"."local_date" < $1 or ("posts"."local_date" = $2 and "posts"."id" < $3))');
    expect(query.params).toEqual(["2026-09-25", "2026-09-25", "post-1"]);
  });
});
