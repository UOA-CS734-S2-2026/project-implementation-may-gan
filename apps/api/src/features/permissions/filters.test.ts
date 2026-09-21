import { describe, expect, it } from "vitest";
import { buildPostVisibilityFilter } from "./filters";
import type { SqlFragment } from "./policy";

const column = (text: string): SqlFragment => ({ text, params: [] });
const columns = {
  postId: column("p.id"),
  authorId: column("p.author_id"),
  audience: column("p.audience"),
  releaseAt: column("p.release_at"),
  deleted: column("p.deleted_at is not null"),
  authorProfileVisibility: column("u.profile_visibility"),
  friendshipActive: column("f.active"),
  blocked: column("b.blocked"),
  publicLinkActive: column("g.active"),
  publicLinkPostId: column("g.post_id"),
  mediaAttached: column("m.attached"),
};

describe("post visibility database filter", () => {
  it("builds a pre-pagination predicate with bound values", () => {
    const result = buildPostVisibilityFilter({
      columns,
      viewer: { userId: "viewer-1" },
      now: new Date("2026-09-22T00:00:00Z"),
    });

    expect(result.cacheControl).toBe("no-store");
    expect(result.where.text).toContain("p.release_at <=");
    expect(result.where.text).toContain("p.author_id =");
    expect(result.where.text).toContain("f.active");
    expect(result.where.text).toContain("not");
    expect(result.where.params).toContain("viewer-1");
  });

  it("adds only a validated public-link branch", () => {
    const withoutGrant = buildPostVisibilityFilter({
      columns,
      viewer: { userId: null },
      now: new Date("2026-09-22T00:00:00Z"),
    });
    const withGrant = buildPostVisibilityFilter({
      columns,
      viewer: { userId: null },
      now: new Date("2026-09-22T00:00:00Z"),
      validatedPublicLinkGrant: { postId: "post-1", active: true },
    });

    expect(withoutGrant.where.text).not.toContain("g.active =");
    expect(withGrant.where.text).toContain("g.active =");
    expect(withGrant.where.text).toContain("p.id =");
    expect(withGrant.where.params).toContain("post-1");

    const inactiveGrant = buildPostVisibilityFilter({
      columns,
      viewer: { userId: null },
      now: new Date("2026-09-22T00:00:00Z"),
      validatedPublicLinkGrant: { postId: "post-1", active: false },
    });
    expect(inactiveGrant.where.text).not.toContain("g.active =");
    expect(inactiveGrant.where.params).not.toContain("post-1");

    const grantForAnotherPost = buildPostVisibilityFilter({
      columns,
      viewer: { userId: null },
      now: new Date("2026-09-22T00:00:00Z"),
      validatedPublicLinkGrant: { postId: "post-2", active: true },
    });
    expect(grantForAnotherPost.where.text).toContain("p.id =");
    expect(grantForAnotherPost.where.params).toContain("post-2");
  });

  it("makes export author-only and media attachment-aware", () => {
    const exported = buildPostVisibilityFilter({
      columns,
      viewer: { userId: "viewer-1" },
      now: new Date("2026-09-22T00:00:00Z"),
      action: "export",
    });
    const media = buildPostVisibilityFilter({
      columns,
      viewer: { userId: "viewer-1" },
      now: new Date("2026-09-22T00:00:00Z"),
      action: "media",
    });

    expect(exported.where.text).not.toContain("f.active");
    expect(media.where.text).toContain("m.attached");
  });
});
