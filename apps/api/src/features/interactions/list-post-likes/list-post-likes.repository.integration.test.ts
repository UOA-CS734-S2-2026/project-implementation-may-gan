import { schema } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createInteractionFixture, fixtureNow, interactionsPostgresEnabled } from "../../../../test/support/interactions/interaction-fixtures";
import { InvalidInteractionCursorError } from "../shared/interaction-cursor";
import { createPostgresPostLikesRepository } from "./list-post-likes.repository";

(interactionsPostgresEnabled ? describe : describe.skip)("PostgreSQL post likers", () => {
  const fixture = createInteractionFixture("likers");
  const { users, posts } = fixture;
  const repo = () => createPostgresPostLikesRepository(fixture.app.db);

  beforeAll(async () => {
    await fixture.setUp();
    const like = (userId: string, minute: number) => ({
      postId: posts.shared,
      userId,
      createdAt: new Date(`2026-09-25T10:0${minute}:00.000Z`),
    });
    await fixture.migrator.db.insert(schema.postLikes).values([
      like(users.friend, 1),
      like(users.otherFriend, 2),
      like(users.blocker, 3),
      like(users.author, 4),
    ]);
  });
  afterAll(() => fixture.tearDown());

  it("lists who liked, newest first, with display names", async () => {
    const page = await repo().listLikes(users.author, posts.shared, fixtureNow, 20);

    expect(page?.items.map((like) => like.person.id)).toEqual([users.author, users.blocker, users.otherFriend, users.friend]);
    expect(page?.items.at(-1)).toMatchObject({ person: { displayName: "Friendly" }, likedAt: "2026-09-25T10:01:00.000Z" });
    expect(page).toMatchObject({ nextCursor: null, hasMore: false });
  });

  it("leaves out people across a block from the viewer, in either direction", async () => {
    const forBlocker = await repo().listLikes(users.blocker, posts.shared, fixtureNow, 20);
    const forBlocked = await repo().listLikes(users.otherFriend, posts.shared, fixtureNow, 20);

    expect(forBlocker?.items.map((like) => like.person.id)).not.toContain(users.otherFriend);
    expect(forBlocked?.items.map((like) => like.person.id)).not.toContain(users.blocker);
  });

  it("pages with an opaque cursor", async () => {
    const first = await repo().listLikes(users.author, posts.shared, fixtureNow, 3);
    const second = await repo().listLikes(users.author, posts.shared, fixtureNow, 3, first!.nextCursor!);

    expect(first).toMatchObject({ hasMore: true });
    expect(second?.items.map((like) => like.person.id)).toEqual([users.friend]);
    await expect(repo().listLikes(users.author, posts.shared, fixtureNow, 3, "nope")).rejects.toBeInstanceOf(InvalidInteractionCursorError);
  });

  it("conceals likes on a post the viewer may not read", async () => {
    await expect(repo().listLikes(users.stranger, posts.shared, fixtureNow, 20)).resolves.toBeNull();
    await expect(repo().listLikes(users.author, posts.deleted, fixtureNow, 20)).resolves.toBeNull();
  });
});
