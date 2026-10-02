import { and, count, eq, isNotNull, sql } from "drizzle-orm";
import { schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { withHyperdriveDatabase } from "../../../infrastructure/database/hyperdrive";
import { buildDrizzleCommentVisibilityFilter, buildDrizzlePostVisibilityFilter } from "../../permissions";
import {
  readAttachedVoiceMemo,
  readAttachedMedia,
  type PostVoiceMemoRef,
  type PostMediaRef,
} from "./post-media";
import { visibleRevisions } from "./post-revisions";
import type { PostDetail } from "./post-detail.contract";

/** The post with its media not yet signed; the route signs it for the response. */
export type PostDetailRecord = Omit<PostDetail, "media" | "voiceMemo"> & {
  media: PostMediaRef[];
  voiceMemo: PostVoiceMemoRef | null;
};

export interface PostDetailRepository {
  /** Null when the post is absent or the viewer may not read it. */
  findPost(viewerId: string, postId: string, now: Date): Promise<PostDetailRecord | null>;
}

/**
 * Reads one post through the shared detail predicate, the same one the feed
 * uses for lists. The owner may read solo and unreleased posts; anyone else
 * needs a released friends post, an active friendship, and no block.
 */
export function createPostgresPostDetailRepository(database: DayliDatabase): PostDetailRepository {
  const { posts, user, dailyPrompts, postRevisions, postLikes, postComments } = schema;
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
        })
        .from(posts)
        .innerJoin(user, eq(posts.authorId, user.id))
        .innerJoin(dailyPrompts, eq(posts.promptId, dailyPrompts.id))
        .where(and(
          eq(posts.id, postId),
          buildDrizzlePostVisibilityFilter(database, { viewer: { userId: viewerId }, now, action: "detail" }),
          isNotNull(user.username),
        ))
        .limit(1);
      if (!row) return null;
      // Read only after the visibility filter allowed the post.
      const viewerIsAuthor = row.authorId === viewerId;
      const [revisions] = await database
        .select({ count: count() })
        .from(postRevisions)
        .where(visibleRevisions(row.id, viewerIsAuthor));
      const revisionCount = revisions?.count ?? 0;
      const [likes] = await database.select({ count: count() }).from(postLikes).where(eq(postLikes.postId, row.id));
      const liked = await database
        .select({ userId: postLikes.userId })
        .from(postLikes)
        .where(and(eq(postLikes.postId, row.id), eq(postLikes.userId, viewerId)))
        .limit(1);
      // The same rule as the comment list, so the count matches what the viewer can open.
      const [comments] = await database
        .select({ count: count() })
        .from(postComments)
        .where(and(eq(postComments.postId, row.id), buildDrizzleCommentVisibilityFilter(database, viewerId)));
      const media = (await readAttachedMedia(database, [row.id])).get(row.id) ?? [];
      const voiceMemo = await readAttachedVoiceMemo(database, row.id);
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
        edited: revisionCount > 0,
        revisionCount,
        likeCount: likes?.count ?? 0,
        viewerHasLiked: liked.length > 0,
        commentCount: comments?.count ?? 0,
        viewerIsAuthor,
        media,
        voiceMemo,
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
