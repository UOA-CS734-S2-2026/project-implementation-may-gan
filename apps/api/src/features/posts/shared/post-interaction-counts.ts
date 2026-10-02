import { and, count, eq, inArray } from "drizzle-orm";
import { schema, type DayliDatabase } from "@dayli/db";
import { buildDrizzleCommentVisibilityFilter } from "../../permissions";

export interface PostInteractionCounts {
  likeCount: number;
  viewerHasLiked: boolean;
  /** Comments and replies the viewer can see, by the comment list's rule. */
  commentCount: number;
}

const none: PostInteractionCounts = { likeCount: 0, viewerHasLiked: false, commentCount: 0 };

/**
 * Like and comment counts for posts the viewer may already read, in three
 * grouped queries for the whole page. Callers pass only IDs their visibility
 * filter allowed.
 */
export async function readInteractionCounts(
  database: Pick<DayliDatabase, "select">,
  viewerId: string,
  postIds: string[],
): Promise<(postId: string) => PostInteractionCounts> {
  if (postIds.length === 0) return () => none;
  const { postLikes, postComments } = schema;
  const [likes, liked, comments] = await Promise.all([
    database
      .select({ postId: postLikes.postId, count: count() })
      .from(postLikes)
      .where(inArray(postLikes.postId, postIds))
      .groupBy(postLikes.postId),
    database
      .select({ postId: postLikes.postId })
      .from(postLikes)
      .where(and(inArray(postLikes.postId, postIds), eq(postLikes.userId, viewerId))),
    database
      .select({ postId: postComments.postId, count: count() })
      .from(postComments)
      .where(and(inArray(postComments.postId, postIds), buildDrizzleCommentVisibilityFilter(database, viewerId)))
      .groupBy(postComments.postId),
  ]);
  const likeCounts = new Map(likes.map((row) => [row.postId, row.count]));
  const likedIds = new Set(liked.map((row) => row.postId));
  const commentCounts = new Map(comments.map((row) => [row.postId, row.count]));
  return (postId) => ({
    likeCount: likeCounts.get(postId) ?? 0,
    viewerHasLiked: likedIds.has(postId),
    commentCount: commentCounts.get(postId) ?? 0,
  });
}
