import { schema } from "@dayli/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createInteractionFixture, fixtureNow, interactionsPostgresEnabled } from "../../../../../test/support/interactions/interaction-fixtures";
import { createPostgresUpdatePostCommentRepository } from "../update-post-comment.repository";

(interactionsPostgresEnabled ? describe : describe.skip)("PostgreSQL comment editing", () => {
  const fixture = createInteractionFixture("cedit");
  const { users, posts, id } = fixture;
  const repo = () => createPostgresUpdatePostCommentRepository(fixture.app.db);
  const later = new Date("2026-09-26T05:00:00.000Z");

  beforeAll(async () => {
    await fixture.setUp();
    await fixture.migrator.db.insert(schema.postComments).values([
      { id: id("mine"), postId: posts.shared, authorId: users.friend, clientCommentId: id("mine"), body: "Nice", createdAt: fixtureNow },
      {
        id: id("deleted"),
        postId: posts.shared,
        authorId: users.friend,
        clientCommentId: id("deleted"),
        body: "Gone",
        createdAt: fixtureNow,
        deletedAt: fixtureNow,
        deletedBy: users.friend,
      },
      {
        id: id("gone-parent"),
        postId: posts.shared,
        authorId: users.otherFriend,
        clientCommentId: id("gone-parent"),
        body: "Parent",
        createdAt: fixtureNow,
        deletedAt: fixtureNow,
        deletedBy: users.otherFriend,
      },
      { id: id("blocked-parent"), postId: posts.shared, authorId: users.otherFriend, clientCommentId: id("blocked-parent"), body: "Parent", createdAt: fixtureNow },
      { id: id("visible-parent"), postId: posts.shared, authorId: users.otherFriend, clientCommentId: id("visible-parent"), body: "Parent", createdAt: fixtureNow },
    ]);
    await fixture.migrator.db.insert(schema.postComments).values([
      { id: id("orphan"), postId: posts.shared, authorId: users.friend, clientCommentId: id("orphan"), parentCommentId: id("gone-parent"), body: "Reply", createdAt: fixtureNow },
      // The blocker blocked the parent's author, so the parent is hidden from them.
      { id: id("shielded"), postId: posts.shared, authorId: users.blocker, clientCommentId: id("shielded"), parentCommentId: id("blocked-parent"), body: "Reply", createdAt: fixtureNow },
      { id: id("reply"), postId: posts.shared, authorId: users.friend, clientCommentId: id("reply"), parentCommentId: id("visible-parent"), body: "Reply", createdAt: fixtureNow },
    ]);
  });
  afterAll(() => fixture.tearDown());

  it("lets the commenter change their comment and marks it edited", async () => {
    await expect(repo().updateComment(users.friend, posts.shared, id("mine"), "Nice!", later)).resolves.toMatchObject({
      text: "Nice!",
      editedAt: later.toISOString(),
      viewerCanEdit: true,
    });
  });

  it("keeps the edit time when the same text is saved again", async () => {
    await repo().updateComment(users.friend, posts.shared, id("mine"), "Same", later);
    await repo().updateComment(users.friend, posts.shared, id("mine"), "Same", new Date("2026-09-26T06:00:00.000Z"));

    const [row] = await fixture.migrator.db.select().from(schema.postComments).where(eq(schema.postComments.id, id("mine")));
    expect(row?.editedAt).toEqual(later);
  });

  it("refuses anyone else, including the post's author, and deleted comments", async () => {
    await expect(repo().updateComment(users.author, posts.shared, id("mine"), "Changed", later)).resolves.toBeNull();
    await expect(repo().updateComment(users.friend, posts.shared, id("deleted"), "Back", later)).resolves.toBeNull();
    await expect(repo().updateComment(users.friend, posts.solo, id("mine"), "Wrong post", later)).resolves.toBeNull();
  });

  it("lets the author of a reply edit it while its parent is visible", async () => {
    await expect(repo().updateComment(users.friend, posts.shared, id("reply"), "Reply!", later)).resolves.toMatchObject({
      text: "Reply!",
      parentCommentId: id("visible-parent"),
    });
  });

  it("refuses to edit a reply whose parent was deleted, and writes nothing", async () => {
    await expect(repo().updateComment(users.friend, posts.shared, id("orphan"), "Edited", later)).resolves.toBeNull();

    const [row] = await fixture.migrator.db.select().from(schema.postComments).where(eq(schema.postComments.id, id("orphan")));
    expect(row).toMatchObject({ body: "Reply", editedAt: null });
  });

  it("refuses to edit a comment on a post whose author has no username yet, as the post detail does", async () => {
    await fixture.migrator.db.insert(schema.postComments).values({
      id: id("on-pending"),
      postId: posts.byPendingAuthor,
      authorId: users.friend,
      clientCommentId: id("on-pending"),
      body: "Hi",
      createdAt: fixtureNow,
    });

    await expect(repo().updateComment(users.friend, posts.byPendingAuthor, id("on-pending"), "Edited", later)).resolves.toBeNull();
    const [row] = await fixture.migrator.db.select().from(schema.postComments).where(eq(schema.postComments.id, id("on-pending")));
    expect(row).toMatchObject({ body: "Hi", editedAt: null });

    await fixture.setPendingAuthorNamed(true);
    try {
      await expect(repo().updateComment(users.friend, posts.byPendingAuthor, id("on-pending"), "Edited", later)).resolves.toMatchObject({
        text: "Edited",
        editedAt: later.toISOString(),
      });
    } finally {
      await fixture.setPendingAuthorNamed(false);
    }
  });

  it("refuses to edit a reply whose parent's author is blocked, and writes nothing", async () => {
    await expect(repo().updateComment(users.blocker, posts.shared, id("shielded"), "Edited", later)).resolves.toBeNull();

    const [row] = await fixture.migrator.db.select().from(schema.postComments).where(eq(schema.postComments.id, id("shielded")));
    expect(row).toMatchObject({ body: "Reply", editedAt: null });
  });
});
