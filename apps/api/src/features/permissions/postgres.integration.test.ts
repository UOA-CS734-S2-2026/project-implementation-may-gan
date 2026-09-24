import { createDayliDatabase, schema } from "@dayli/db";
import { afterAll, describe, expect, it } from "vitest";
import { findVisiblePost, listVisiblePosts } from "./drizzle";

const databaseUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl && process.env.PERMISSIONS_POSTGRES_TEST === "1");

function requireLocalTestUrl(value: string): string {
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== "5433" || url.pathname !== "/dayli_test") {
    throw new Error("TEST_DATABASE_URL must target localhost:5433/dayli_test.");
  }
  return value;
}

/**
 * This test uses one transaction and rolls it back. It never truncates or
 * mutates rows belonging to another test or developer.
 */
(enabled ? describe : describe.skip)("PostgreSQL permission query parity", () => {
  const client = databaseUrl ? createDayliDatabase(requireLocalTestUrl(databaseUrl)) : undefined;

  afterAll(async () => client?.close());

  it("filters before pagination and gives list/detail the same answer", async () => {
    if (!client) return;
    const rollback = Symbol("rollback");

    try {
      await client.db.transaction(async (transaction) => {
        const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const authorId = `permissions-author-${suffix}`;
        const viewerId = `permissions-viewer-${suffix}`;
        const postIds = ["old", "new", "future", "solo"].map((name) => `permissions-${name}-${suffix}`);
        const now = new Date("2026-09-22T12:00:00.000Z");

        await transaction.insert(schema.user).values([
          { id: authorId, name: "Permission Author", email: `${authorId}@example.test` },
          { id: viewerId, name: "Permission Viewer", email: `${viewerId}@example.test` },
        ]);
        await transaction.insert(schema.friendships).values([
          { userId: authorId, friendId: viewerId, state: "active", stateChangedAt: now },
          { userId: viewerId, friendId: authorId, state: "active", stateChangedAt: now },
        ]);

        await transaction.insert(schema.posts).values([
          { id: postIds[0], authorId, localDate: "2026-09-20", promptId: "prompt-01-01", reflectiveAnswer: "old", rating: 7, audience: "friends", acceptedAt: new Date("2026-09-20T10:00:00Z"), releasedAt: new Date("2026-09-20T11:00:00Z") },
          { id: postIds[1], authorId, localDate: "2026-09-21", promptId: "prompt-01-01", reflectiveAnswer: "new", rating: 8, audience: "friends", acceptedAt: new Date("2026-09-21T10:00:00Z"), releasedAt: new Date("2026-09-21T11:00:00Z") },
          { id: postIds[2], authorId, localDate: "2026-09-22", promptId: "prompt-01-01", reflectiveAnswer: "future", rating: 9, audience: "friends", acceptedAt: new Date("2026-09-22T10:00:00Z"), releasedAt: new Date("2026-09-23T11:00:00Z") },
          { id: postIds[3], authorId, localDate: "2026-09-19", promptId: "prompt-01-01", reflectiveAnswer: "solo", rating: 6, audience: "solo", acceptedAt: new Date("2026-09-19T10:00:00Z"), releasedAt: new Date("2026-09-19T11:00:00Z") },
        ]);

        const input = { viewer: { userId: viewerId }, now };
        const firstPage = await listVisiblePosts(transaction, input, { limit: 1 });
        const secondPage = await listVisiblePosts(transaction, input, { limit: 1, offset: 1 });
        expect(firstPage.map(({ post }) => post.id)).toEqual([postIds[1]]);
        expect(secondPage.map(({ post }) => post.id)).toEqual([postIds[0]]);

        for (const id of [...firstPage, ...secondPage].map(({ post }) => post.id)) {
          expect((await findVisiblePost(transaction, id, input))?.id).toBe(id);
        }
        expect((await findVisiblePost(transaction, postIds[2], input))).toBeNull();
        expect((await findVisiblePost(transaction, postIds[3], input))).toBeNull();

        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  });
});
