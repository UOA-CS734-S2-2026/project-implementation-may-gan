import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import { schema } from "@dayli/db";
import { buildDrizzlePostVisibilityFilter } from "./drizzle";

const database = drizzle.mock({ schema });

const sqlQuery = (fragment: ReturnType<typeof buildDrizzlePostVisibilityFilter>) => {
  if (!fragment) throw new Error("expected a Drizzle SQL predicate");
  return new PgDialect().sqlToQuery(fragment);
};

const sqlText = (fragment: ReturnType<typeof buildDrizzlePostVisibilityFilter>) =>
  sqlQuery(fragment).sql;

describe("concrete PostgreSQL permission filter", () => {
  it("uses paired active friendships and both-direction active blocks", () => {
    const fragment = buildDrizzlePostVisibilityFilter(database, {
      viewer: { userId: "viewer-1" },
      now: new Date("2026-09-22T00:00:00Z"),
    });
    const text = sqlText(fragment);

    expect(text).toContain('select "friend_id" from "friendships"');
    expect(text.match(/"friendships"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(text).toContain('"state" = $');
    expect(sqlQuery(fragment).params).toContain("active");
    expect(text).toContain('select "user_id" from "account_lifecycles"');
    expect(text).toContain('"account_lifecycles"."state" <> $');
    expect(text).toContain('select "blocker_id" from "relationship_blocks"');
    expect(text).toContain('"unblocked_at" is null');
  });

  it("allows anonymous detail only for released friends posts from public profiles", () => {
    const detail = sqlQuery(buildDrizzlePostVisibilityFilter(database, {
      viewer: { userId: null },
      now: new Date("2026-09-22T00:00:00Z"),
      action: "detail",
    }));
    const profile = sqlQuery(buildDrizzlePostVisibilityFilter(database, {
      viewer: { userId: null },
      now: new Date("2026-09-22T00:00:00Z"),
      action: "profile",
    }));
    const list = sqlQuery(buildDrizzlePostVisibilityFilter(database, {
      viewer: { userId: null },
      now: new Date("2026-09-22T00:00:00Z"),
      action: "list",
    }));

    expect(detail.sql).toContain('"posts"."audience" = $');
    expect(detail.sql).toContain('"user"."profile_visibility" = $');
    expect(detail.params).toContain("friends");
    expect(detail.params).toContain("public");
    expect(profile.params).toContain("public");
    expect(list.params).not.toContain("public");
  });

  it("requires a currently attached media row", () => {
    const query = sqlQuery(buildDrizzlePostVisibilityFilter(database, {
      viewer: { userId: "alice" },
      now: new Date("2026-09-22T00:00:00Z"),
      action: "media",
      mediaId: "media-1",
    }));

    expect(query.sql).toContain('select "id" from "post_media"');
    expect(query.sql).toContain('"post_media"."detached_at" is null');
    expect(query.sql).toContain('"post_media"."id" = $');
    expect(query.params).toContain("media-1");
  });

  it("keeps export owner-only", () => {
    const query = sqlQuery(buildDrizzlePostVisibilityFilter(database, {
      viewer: { userId: "viewer-1" },
      now: new Date("2026-09-22T00:00:00Z"),
      action: "export",
    }));

    expect(query.sql).toMatch(/"posts"\."author_id" = \$/);
    expect(query.sql).not.toContain('"friendships"');
    expect(query.sql).not.toContain('"posts"."released_at"');
    expect(query.sql).not.toContain('"account_lifecycles"');
  });
});
