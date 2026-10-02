import { schema } from "@dayli/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createInteractionFixture, fixtureNow, interactionsPostgresEnabled } from "../../../../test/support/interactions/interaction-fixtures";
import { createPostgresUpdatePostCommentRepository } from "./update-post-comment.repository";

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
});
