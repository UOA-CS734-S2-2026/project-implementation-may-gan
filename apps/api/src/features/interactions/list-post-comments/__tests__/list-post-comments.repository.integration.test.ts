import { schema } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createInteractionFixture, fixtureNow, interactionsPostgresEnabled } from "../../../../../test/support/interactions/interaction-fixtures";
import { InvalidInteractionCursorError } from "../../shared/interaction-cursor";
import { createPostgresPostCommentsRepository } from "../list-post-comments.repository";

(interactionsPostgresEnabled ? describe : describe.skip)("PostgreSQL comment list", () => {
  const fixture = createInteractionFixture("comments");
  const { users, posts, id } = fixture;
  const repo = () => createPostgresPostCommentsRepository(fixture.app.db);
  const texts = async (viewer: string) => (await repo().listComments(viewer, posts.shared, fixtureNow, 50))?.items.map((comment) => comment.text);

  beforeAll(async () => {
    await fixture.setUp();
    const comment = (key: string, authorId: string, minute: number, parentKey?: string, deleted = false) => ({
      id: id(key),
      postId: posts.shared,
      authorId,
      parentCommentId: parentKey ? id(parentKey) : null,
      clientCommentId: id(key),
      body: key,
      createdAt: new Date(`2026-09-25T10:${String(minute).padStart(2, "0")}:00.000Z`),
      deletedAt: deleted ? new Date("2026-09-25T11:00:00.000Z") : null,
      deletedBy: deleted ? users.author : null,
    });
    await fixture.migrator.db.insert(schema.postComments).values([
      comment("first", users.friend, 1),
      comment("gone", users.otherFriend, 2, undefined, true),
      comment("under-gone", users.friend, 3, "gone"),
      comment("by-other", users.otherFriend, 4),
      comment("reply-to-first", users.author, 5, "first"),
      comment("by-blocker", users.blocker, 6),
      comment("reply-by-blocker", users.blocker, 7, "by-other"),
      comment("by-no-username", users.noUsername, 8),
      comment("under-no-username", users.friend, 9, "by-no-username"),
    ]);
  });
  afterAll(() => fixture.tearDown());

  it("lists comments and replies oldest first, leaving out deleted threads", async () => {
    await expect(texts(users.author)).resolves.toEqual(["first", "by-other", "reply-to-first", "by-blocker", "reply-by-blocker"]);
  });

  it("leaves out comments by someone without a username, and replies under them", async () => {
    const texts = (await repo().listComments(users.author, posts.shared, fixtureNow, 50))?.items.map((comment) => comment.text);

    expect(texts).not.toContain("by-no-username");
    expect(texts).not.toContain("under-no-username");
  });

  it("hides people across a block, and replies under a hidden comment", async () => {
    await expect(texts(users.blocker)).resolves.toEqual(["first", "reply-to-first", "by-blocker"]);
    await expect(texts(users.otherFriend)).resolves.toEqual(["first", "by-other", "reply-to-first"]);
  });

  it("tells each viewer what they may change", async () => {
    const forFriend = await repo().listComments(users.friend, posts.shared, fixtureNow, 50);
    const forAuthor = await repo().listComments(users.author, posts.shared, fixtureNow, 50);

    expect(forFriend?.items.find((comment) => comment.text === "first")).toMatchObject({ viewerCanEdit: true, viewerCanDelete: true });
    expect(forFriend?.items.find((comment) => comment.text === "by-other")).toMatchObject({ viewerCanEdit: false, viewerCanDelete: false });
    expect(forAuthor?.items.find((comment) => comment.text === "by-other")).toMatchObject({ viewerCanEdit: false, viewerCanDelete: true });
  });

  it("pages with an opaque cursor", async () => {
    const first = await repo().listComments(users.author, posts.shared, fixtureNow, 2);
    const second = await repo().listComments(users.author, posts.shared, fixtureNow, 2, first!.nextCursor!);

    expect(first?.items.map((comment) => comment.text)).toEqual(["first", "by-other"]);
    expect(second?.items.map((comment) => comment.text)).toEqual(["reply-to-first", "by-blocker"]);
    await expect(repo().listComments(users.author, posts.shared, fixtureNow, 2, "nope")).rejects.toBeInstanceOf(InvalidInteractionCursorError);
  });

  it("conceals comments on a post the viewer may not read", async () => {
    await expect(repo().listComments(users.stranger, posts.shared, fixtureNow, 20)).resolves.toBeNull();
    await expect(repo().listComments(users.blockedByAuthor, posts.shared, fixtureNow, 20)).resolves.toBeNull();
    await expect(repo().listComments(users.author, posts.deleted, fixtureNow, 20)).resolves.toBeNull();
  });

  it("conceals comments on a friend's post until its author has a username, as the post detail does", async () => {
    await fixture.migrator.db.insert(schema.postComments).values({
      id: id("on-pending"),
      postId: posts.byPendingAuthor,
      authorId: users.friend,
      clientCommentId: id("on-pending"),
      body: "on-pending",
      createdAt: fixtureNow,
    });

    await expect(repo().listComments(users.friend, posts.byPendingAuthor, fixtureNow, 20)).resolves.toBeNull();
    await fixture.setPendingAuthorNamed(true);
    try {
      const page = await repo().listComments(users.friend, posts.byPendingAuthor, fixtureNow, 20);
      expect(page?.items.map((comment) => comment.text)).toEqual(["on-pending"]);
    } finally {
      await fixture.setPendingAuthorNamed(false);
    }
  });
});
