import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { buildDrizzlePostVisibilityFilter } from "./drizzle";

const sqlQuery = (fragment: ReturnType<typeof buildDrizzlePostVisibilityFilter>) => {
  if (!fragment) throw new Error("expected a Drizzle SQL predicate");
  return new PgDialect().sqlToQuery(fragment);
};

const sqlText = (fragment: ReturnType<typeof buildDrizzlePostVisibilityFilter>) =>
  sqlQuery(fragment).sql;

describe("concrete PostgreSQL permission filter", () => {
  it("uses paired active friendships and both-direction active blocks", () => {
    const text = sqlText(buildDrizzlePostVisibilityFilter({
      viewer: { userId: "viewer-1" },
      now: new Date("2026-09-22T00:00:00Z"),
    }));

    expect(text).toContain('"friendships"');
    expect(text.match(/"friendships"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(text).toContain("state" + '" = \'active\'');
    expect(text).toContain('"relationship_blocks"');
    expect(text).toContain('"unblocked_at" is null');
  });

  it("binds an active public grant to one post and requires a public profile", () => {
    const fragment = buildDrizzlePostVisibilityFilter({
      viewer: { userId: null },
      now: new Date("2026-09-22T00:00:00Z"),
      validatedPublicLinkGrant: { postId: "post-1", active: true },
    });
    const query = sqlQuery(fragment);

    expect(query.sql).toContain('"posts"."id" = $');
    expect(query.sql).toContain('"user"."profile_visibility"');
    expect(query.params).toContain("post-1");
  });

  it("requires a currently attached media row", () => {
    const query = sqlQuery(buildDrizzlePostVisibilityFilter({
      viewer: { userId: "alice" },
      now: new Date("2026-09-22T00:00:00Z"),
      action: "media",
      mediaId: "media-1",
    }));

    expect(query.sql).toContain('"post_media"."detached_at" is null');
    expect(query.sql).toContain('"post_media"."id" = $');
    expect(query.params).toContain("media-1");
  });

  it("keeps export owner-only", () => {
    const query = sqlQuery(buildDrizzlePostVisibilityFilter({
      viewer: { userId: "viewer-1" },
      now: new Date("2026-09-22T00:00:00Z"),
      action: "export",
    }));

    expect(query.sql).toMatch(/"posts"\."author_id" = \$/);
    expect(query.sql).not.toContain('"friendships"');
    expect(query.sql).not.toContain('"posts"."released_at"');
  });
});
