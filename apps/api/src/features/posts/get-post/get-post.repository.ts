import { and, eq, exists, isNotNull, notExists, sql } from "drizzle-orm";
import { schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { withHyperdriveDatabase } from "../../../infrastructure/database/hyperdrive";
import { buildDrizzlePostVisibilityFilter } from "../../permissions";
import type { PostDetail } from "./get-post.contract";

export interface PostDetailRepository {
  /** Null when the post is absent or the viewer may not read it. */
  findPost(viewerId: string, postId: string, now: Date): Promise<PostDetail | null>;
}

/**
 * Reads one post through the shared detail predicate, the same one the feed
 * uses for lists. The owner may read solo and unreleased posts; anyone else
 * needs a released friends post, an active friendship, and no block.
 */
export function createPostgresPostDetailRepository(database: DayliDatabase): PostDetailRepository {
  const { posts, user, dailyPrompts, postRevisions } = schema;
  return {
    async findPost(viewerId, postId, now) {
      const [row] = await database
        .select({
          id: posts.id,
          authorId: posts.authorId,
          username: user.username,
          displayName: sql<string>`coalesce(${user.displayUsername}, ${user.username})`,
          localDate: posts.localDate,
          promptId: posts.promptId,
          promptText: dailyPrompts.text,
          reflectiveAnswer: posts.reflectiveAnswer,
          caption: posts.caption,
          rating: posts.rating,
          audience: posts.audience,
          acceptedAt: posts.acceptedAt,
          releasedAt: posts.releasedAt,
          edited: exists(
            database
              .select({ revisionId: postRevisions.id })
              .from(postRevisions)
              .where(eq(postRevisions.postId, posts.id)),
          ).mapWith(Boolean),
        })
        .from(posts)
        .innerJoin(user, eq(posts.authorId, user.id))
        .innerJoin(dailyPrompts, eq(posts.promptId, dailyPrompts.id))
        .where(and(
          eq(posts.id, postId),
          buildDrizzlePostVisibilityFilter(database, { viewer: { userId: viewerId }, now, action: "detail" }),
          isNotNull(user.username),
          notExists(database.select({ one: sql`1` }).from(schema.accountLifecycles).where(and(
            eq(schema.accountLifecycles.userId, posts.authorId),
            eq(schema.accountLifecycles.state, "pending_deletion"),
          ))),
        ))
        .limit(1);
      if (!row) return null;
      return {
        id: row.id,
        author: { id: row.authorId, username: row.username!, displayName: row.displayName },
        localDate: row.localDate,
        prompt: { id: row.promptId, text: row.promptText },
        reflectiveAnswer: row.reflectiveAnswer,
        caption: row.caption,
        rating: row.rating,
        audience: row.audience,
        acceptedAt: row.acceptedAt.toISOString(),
        releasedAt: row.releasedAt.toISOString(),
        edited: row.edited,
        viewerIsAuthor: row.authorId === viewerId,
      };
    },
  };
}

/** Workers close the request-scoped Hyperdrive client after each read. */
export function createHyperdrivePostDetailRepository(hyperdrive: HyperdriveBinding): PostDetailRepository {
  return {
    findPost: (viewerId, postId, now) => withHyperdriveDatabase(hyperdrive, (database) => (
      createPostgresPostDetailRepository(database).findPost(viewerId, postId, now)
    )),
  };
}
