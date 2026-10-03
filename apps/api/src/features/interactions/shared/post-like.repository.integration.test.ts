import { schema } from "@dayli/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createInteractionFixture, fixtureNow, interactionsPostgresEnabled } from "../../../../test/support/interactions/interaction-fixtures";
import { createPostgresPostLikeRepository } from "./post-like.repository";

(interactionsPostgresEnabled ? describe : describe.skip)("PostgreSQL post likes", () => {
  const fixture = createInteractionFixture("like");
  const { users, posts } = fixture;
  const repo = () => createPostgresPostLikeRepository(fixture.app.db);

  beforeAll(() => fixture.setUp());
  afterAll(() => fixture.tearDown());

  it("likes and unlikes, and repeating either changes nothing", async () => {
    await expect(repo().setLike(users.friend, posts.shared, true, fixtureNow)).resolves.toEqual({ likeCount: 1, viewerHasLiked: true });
    await expect(repo().setLike(users.friend, posts.shared, true, fixtureNow)).resolves.toEqual({ likeCount: 1, viewerHasLiked: true });
    await expect(repo().setLike(users.author, posts.shared, true, fixtureNow)).resolves.toEqual({ likeCount: 2, viewerHasLiked: true });

    await expect(repo().setLike(users.friend, posts.shared, false, fixtureNow)).resolves.toEqual({ likeCount: 1, viewerHasLiked: false });
    await expect(repo().setLike(users.friend, posts.shared, false, fixtureNow)).resolves.toEqual({ likeCount: 1, viewerHasLiked: false });
  });

  it("counts one like when the same person likes concurrently", async () => {
    await Promise.all(Array.from({ length: 5 }, () => repo().setLike(users.otherFriend, posts.shared, true, fixtureNow)));

    await expect(repo().setLike(users.otherFriend, posts.shared, true, fixtureNow)).resolves.toEqual({ likeCount: 2, viewerHasLiked: true });
  });

  it.each([
    ["a stranger", "stranger", "shared"],
    ["someone the author blocked", "blockedByAuthor", "shared"],
    ["a friend on a solo post", "friend", "solo"],
    ["the author on a deleted post", "author", "deleted"],
  ] as const)("refuses %s", async (_, viewer, post) => {
    await expect(repo().setLike(users[viewer], posts[post], true, fixtureNow)).resolves.toBeNull();
  });

  it("goes with its post, comments included, when Trash cleanup purges it", async () => {
    // complete_post_trash_cleanup deletes post rows directly; these must not block it.
    const purged = fixture.id("purged");
    await fixture.migrator.db.insert(schema.posts).values({
      id: purged,
      authorId: users.author,
      localDate: "2026-09-21",
      promptId: "prompt-09-21",
      reflectiveAnswer: "Soon purged",
      rating: 5,
      audience: "friends",
      acceptedAt: new Date("2026-09-21T03:00:00.000Z"),
      releasedAt: new Date("2026-09-21T12:00:00.000Z"),
    });
    await fixture.migrator.db.insert(schema.postLikes).values({ postId: purged, userId: users.friend });
    await fixture.migrator.db.insert(schema.postComments).values([
      { id: fixture.id("purged-c1"), postId: purged, authorId: users.friend, clientCommentId: fixture.id("purged-c1"), body: "Top" },
      { id: fixture.id("purged-c2"), postId: purged, authorId: users.author, parentCommentId: fixture.id("purged-c1"), clientCommentId: fixture.id("purged-c2"), body: "Reply" },
    ]);

    await fixture.migrator.db.delete(schema.posts).where(eq(schema.posts.id, purged));

    expect(await fixture.migrator.db.select().from(schema.postLikes).where(eq(schema.postLikes.postId, purged))).toEqual([]);
    expect(await fixture.migrator.db.select().from(schema.postComments).where(eq(schema.postComments.postId, purged))).toEqual([]);
  });

  it("refuses a friend before the post is released", async () => {
    await expect(repo().setLike(users.friend, posts.shared, true, new Date("2026-09-24T11:00:00.000Z"))).resolves.toBeNull();
  });
});
