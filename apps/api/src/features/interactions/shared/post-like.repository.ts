import { and, count, eq } from "drizzle-orm";
import { schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { withHyperdriveDatabase } from "../../../infrastructure/database/hyperdrive";
import type { PostLikeSummary } from "./interactions.contract";
import { findReadablePost } from "./readable-post";

export interface PostLikeRepository {
  /**
   * Likes or unlikes the post for the viewer and returns the new summary, or
   * null when the viewer may not read the post. Repeating either is a no-op,
   * so retries never change the count twice.
   */
  setLike(viewerId: string, postId: string, liked: boolean, now: Date): Promise<PostLikeSummary | null>;
}

export async function readLikeSummary(
  database: Pick<DayliDatabase, "select">,
  viewerId: string,
  postId: string,
): Promise<PostLikeSummary> {
  const { postLikes } = schema;
  const [total] = await database.select({ count: count() }).from(postLikes).where(eq(postLikes.postId, postId));
  const mine = await database
    .select({ userId: postLikes.userId })
    .from(postLikes)
    .where(and(eq(postLikes.postId, postId), eq(postLikes.userId, viewerId)))
    .limit(1);
  return { likeCount: total?.count ?? 0, viewerHasLiked: mine.length > 0 };
}

export function createPostgresPostLikeRepository(database: DayliDatabase): PostLikeRepository {
  const { postLikes } = schema;
  return {
    setLike(viewerId, postId, liked, now) {
      return database.transaction(async (tx) => {
        if (!await findReadablePost(tx, viewerId, postId, now)) return null;
        if (liked) {
          await tx.insert(postLikes).values({ postId, userId: viewerId, createdAt: now }).onConflictDoNothing();
        } else {
          await tx.delete(postLikes).where(and(eq(postLikes.postId, postId), eq(postLikes.userId, viewerId)));
        }
        return readLikeSummary(tx, viewerId, postId);
      });
    },
  };
}

/** Workers close the request-scoped Hyperdrive client after each change. */
export function createHyperdrivePostLikeRepository(hyperdrive: HyperdriveBinding): PostLikeRepository {
  return {
    setLike: (viewerId, postId, liked, now) => withHyperdriveDatabase(hyperdrive, (database) => (
      createPostgresPostLikeRepository(database).setLike(viewerId, postId, liked, now)
    )),
  };
}
