import { schema } from "@dayli/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createInteractionFixture, fixtureNow, interactionsPostgresEnabled } from "../../../../test/support/interactions/interaction-fixtures";
import { createPostgresDeletePostCommentRepository } from "./delete-post-comment.repository";

(interactionsPostgresEnabled ? describe : describe.skip)("PostgreSQL comment deletion", () => {
  const fixture = createInteractionFixture("cdel");
  const { users, posts, id } = fixture;
  const repo = () => createPostgresDeletePostCommentRepository(fixture.app.db);
  const comment = (key: string, authorId: string) => ({
    id: id(key),
    postId: posts.shared,
    authorId,
    clientCommentId: id(key),
    body: key,
    createdAt: fixtureNow,
  });
  const row = async (key: string) => {
    const [found] = await fixture.migrator.db.select().from(schema.postComments).where(eq(schema.postComments.id, id(key)));
    return found;
  };

  beforeAll(async () => {
    await fixture.setUp();
    await fixture.migrator.db.insert(schema.postComments).values([
      comment("own", users.friend),
      comment("moderated", users.friend),
      comment("protected", users.otherFriend),
      { ...comment("gone-parent", users.otherFriend), deletedAt: fixtureNow, deletedBy: users.otherFriend },
      comment("blocked-parent", users.otherFriend),
    ]);
    await fixture.migrator.db.insert(schema.postComments).values([
      { ...comment("orphan", users.friend), parentCommentId: id("gone-parent") },
      { ...comment("shielded", users.blocker), parentCommentId: id("blocked-parent") },
    ]);
  });
  afterAll(() => fixture.tearDown());

  it("lets the commenter delete their comment, and deleting again keeps the first deletion", async () => {
    await expect(repo().deleteComment(users.friend, posts.shared, id("own"), fixtureNow)).resolves.toBe(true);
    await expect(repo().deleteComment(users.friend, posts.shared, id("own"), new Date("2026-09-26T09:00:00.000Z"))).resolves.toBe(true);

    expect(await row("own")).toMatchObject({ deletedAt: fixtureNow, deletedBy: users.friend });
  });

  it("lets the post's author delete anyone's comment", async () => {
    await expect(repo().deleteComment(users.author, posts.shared, id("moderated"), fixtureNow)).resolves.toBe(true);

    expect(await row("moderated")).toMatchObject({ deletedBy: users.author });
  });

  it("refuses other readers and anyone who may not read the post", async () => {
    await expect(repo().deleteComment(users.friend, posts.shared, id("protected"), fixtureNow)).resolves.toBe(false);
    await expect(repo().deleteComment(users.blockedByAuthor, posts.shared, id("protected"), fixtureNow)).resolves.toBe(false);
    await expect(repo().deleteComment(users.author, posts.shared, id("missing"), fixtureNow)).resolves.toBe(false);

    expect(await row("protected")).toMatchObject({ deletedAt: null });
  });

  it("refuses to delete a reply whose parent is deleted or its author is blocked", async () => {
    await expect(repo().deleteComment(users.friend, posts.shared, id("orphan"), fixtureNow)).resolves.toBe(false);
    await expect(repo().deleteComment(users.author, posts.shared, id("orphan"), fixtureNow)).resolves.toBe(false);
    await expect(repo().deleteComment(users.blocker, posts.shared, id("shielded"), fixtureNow)).resolves.toBe(false);

    expect(await row("orphan")).toMatchObject({ deletedAt: null });
    expect(await row("shielded")).toMatchObject({ deletedAt: null });
  });
});
