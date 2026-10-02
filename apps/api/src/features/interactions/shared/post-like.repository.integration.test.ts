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

  it("refuses a friend before the post is released", async () => {
    await expect(repo().setLike(users.friend, posts.shared, true, new Date("2026-09-24T11:00:00.000Z"))).resolves.toBeNull();
  });
});
