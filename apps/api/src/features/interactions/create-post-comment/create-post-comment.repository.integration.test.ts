import { schema } from "@dayli/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createInteractionFixture, fixtureNow, interactionsPostgresEnabled } from "../../../../test/support/interactions/interaction-fixtures";
import { createPostgresCreatePostCommentRepository } from "./create-post-comment.repository";

(interactionsPostgresEnabled ? describe : describe.skip)("PostgreSQL comment creation", () => {
  const fixture = createInteractionFixture("comment");
  const { users, posts } = fixture;
  const repo = () => createPostgresCreatePostCommentRepository(fixture.app.db);
  const create = (viewer: string, clientCommentId: string, text: string, parentCommentId?: string, post = posts.shared) =>
    repo().createComment(viewer, post, { clientCommentId, text, ...(parentCommentId ? { parentCommentId } : {}) }, fixtureNow);

  beforeAll(() => fixture.setUp());
  afterAll(() => fixture.tearDown());

  it("adds a comment with the author's permissions on it", async () => {
    const outcome = await create(users.friend, "c-1", "What a view!");

    expect(outcome).toMatchObject({
      kind: "created",
      comment: {
        postId: posts.shared,
        parentCommentId: null,
        author: { id: users.friend, displayName: "Friendly" },
        text: "What a view!",
        createdAt: fixtureNow.toISOString(),
        editedAt: null,
        viewerCanEdit: true,
        viewerCanDelete: true,
      },
    });
  });

  it("returns the same comment for a retry and refuses a reused ID", async () => {
    const first = await create(users.otherFriend, "c-retry", "Again?");
    const retry = await create(users.otherFriend, "c-retry", "Again?");
    const reused = await create(users.otherFriend, "c-retry", "Something else");

    expect(first.kind).toBe("created");
    expect(retry).toEqual({ kind: "replayed", comment: (first as { comment: unknown }).comment });
    expect(reused).toEqual({ kind: "conflict" });
    const rows = await fixture.migrator.db.select().from(schema.postComments).where(eq(schema.postComments.clientCommentId, "c-retry"));
    expect(rows).toHaveLength(1);
  });

  it("makes one comment when the same retry races", async () => {
    const outcomes = await Promise.all([
      create(users.friend, "c-race", "Racing"),
      create(users.friend, "c-race", "Racing"),
    ]);

    expect(outcomes.map((outcome) => outcome.kind).sort()).toEqual(["created", "replayed"]);
    const rows = await fixture.migrator.db.select().from(schema.postComments).where(eq(schema.postComments.clientCommentId, "c-race"));
    expect(rows).toHaveLength(1);
  });

  it("replies one level deep, only to a top-level comment on the same post", async () => {
    const parent = await create(users.friend, "c-parent", "Top level");
    const parentId = (parent as { comment: { id: string } }).comment.id;
    const reply = await create(users.author, "c-reply", "Thanks!", parentId);
    const replyId = (reply as { comment: { id: string } }).comment.id;

    expect(reply).toMatchObject({ kind: "created", comment: { parentCommentId: parentId, viewerCanDelete: true } });
    await expect(create(users.friend, "c-nested", "Too deep", replyId)).resolves.toEqual({ kind: "invalid_parent" });
    await expect(create(users.friend, "c-missing", "Nobody", fixture.id("missing"))).resolves.toEqual({ kind: "invalid_parent" });
  });

  it("refuses a reply to someone across a block", async () => {
    const parent = await create(users.otherFriend, "c-blocked-parent", "Hello all");
    const parentId = (parent as { comment: { id: string } }).comment.id;

    await expect(create(users.blocker, "c-blocked-reply", "Hi", parentId)).resolves.toEqual({ kind: "invalid_parent" });
  });

  it.each([
    ["a stranger", "stranger", "shared"],
    ["someone the author blocked", "blockedByAuthor", "shared"],
    ["a friend on a solo post", "friend", "solo"],
    ["the author on a deleted post", "author", "deleted"],
  ] as const)("refuses %s", async (_, viewer, post) => {
    await expect(create(users[viewer], `c-refused-${viewer}-${post}`, "Hi", undefined, posts[post])).resolves.toEqual({ kind: "not_found" });
  });

  it("refuses a friend on a post whose author has no username yet, as the post detail does", async () => {
    const clientCommentId = fixture.id("c-pending");

    await expect(create(users.friend, clientCommentId, "Hi", undefined, posts.byPendingAuthor)).resolves.toEqual({ kind: "not_found" });
    expect(await fixture.migrator.db.select().from(schema.postComments).where(eq(schema.postComments.clientCommentId, clientCommentId))).toEqual([]);

    await fixture.setPendingAuthorNamed(true);
    try {
      await expect(create(users.friend, clientCommentId, "Hi", undefined, posts.byPendingAuthor)).resolves.toMatchObject({
        kind: "created",
        comment: { postId: posts.byPendingAuthor, text: "Hi" },
      });
    } finally {
      await fixture.setPendingAuthorNamed(false);
    }
  });
});
