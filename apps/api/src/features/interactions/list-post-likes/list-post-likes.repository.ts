import { and, desc, eq, isNotNull, lt, or, sql } from "drizzle-orm";
import { schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { withHyperdriveDatabase } from "../../../infrastructure/database/hyperdrive";
import { notBlockedWith } from "../../permissions";
import { decodeInteractionCursor, encodeInteractionCursor } from "../shared/interaction-cursor";
import { findReadablePost } from "../shared/readable-post";
import type { PostLikesPage } from "./list-post-likes.contract";

export interface PostLikesRepository {
  /** Null when the viewer may not read the post. */
  listLikes(viewerId: string, postId: string, now: Date, limit: number, cursor?: string): Promise<PostLikesPage | null>;
}

/** Who liked a post, newest first. People across a block from the viewer are left out. */
export function createPostgresPostLikesRepository(database: DayliDatabase): PostLikesRepository {
  const { postLikes, user } = schema;
  return {
    async listLikes(viewerId, postId, now, limit, rawCursor) {
      const cursor = decodeInteractionCursor(rawCursor);
      if (!await findReadablePost(database, viewerId, postId, now)) return null;

      const rows = await database
        .select({
          userId: postLikes.userId,
          username: user.username,
          displayName: sql<string>`coalesce(${user.displayUsername}, ${user.username})`,
          likedAt: postLikes.createdAt,
        })
        .from(postLikes)
        .innerJoin(user, eq(postLikes.userId, user.id))
        .where(and(
          eq(postLikes.postId, postId),
          isNotNull(user.username),
          notBlockedWith(database, viewerId, postLikes.userId),
          cursor === undefined
            ? undefined
            : or(lt(postLikes.createdAt, cursor.at), and(eq(postLikes.createdAt, cursor.at), lt(postLikes.userId, cursor.id))),
        ))
        .orderBy(desc(postLikes.createdAt), desc(postLikes.userId))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map((row) => ({
          person: { id: row.userId, username: row.username!, displayName: row.displayName },
          likedAt: row.likedAt.toISOString(),
        })),
        nextCursor: hasMore && last ? encodeInteractionCursor({ at: last.likedAt, id: last.userId }) : null,
        hasMore,
      };
    },
  };
}

/** Workers close the request-scoped Hyperdrive client after each read. */
export function createHyperdrivePostLikesRepository(hyperdrive: HyperdriveBinding): PostLikesRepository {
  return {
    listLikes: (viewerId, postId, now, limit, cursor) => withHyperdriveDatabase(hyperdrive, (database) => (
      createPostgresPostLikesRepository(database).listLikes(viewerId, postId, now, limit, cursor)
    )),
  };
}
