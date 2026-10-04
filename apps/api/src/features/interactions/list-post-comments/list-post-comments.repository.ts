import { and, asc, eq, gt, isNotNull, or } from "drizzle-orm";
import { schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { withHyperdriveDatabase } from "../../../infrastructure/database/hyperdrive";
import { buildDrizzleCommentVisibilityFilter } from "../../permissions";
import { decodeInteractionCursor, encodeInteractionCursor } from "../shared/interaction-cursor";
import { commentColumns, toPostComment } from "../shared/post-comment.projection";
import { findReadablePost } from "../shared/readable-post";
import type { PostCommentsPage } from "./list-post-comments.contract";

export interface PostCommentsRepository {
  /** Null when the viewer may not read the post. */
  listComments(viewerId: string, postId: string, now: Date, limit: number, cursor?: string): Promise<PostCommentsPage | null>;
}

/**
 * Comments and replies oldest first, by `(created_at, id)`, which never
 * changes, so pages don't repeat or skip a comment. Deleted comments, replies
 * under them, and anything across a block from the viewer are left out.
 */
export function createPostgresPostCommentsRepository(database: DayliDatabase): PostCommentsRepository {
  const { postComments, user } = schema;
  return {
    async listComments(viewerId, postId, now, limit, rawCursor) {
      const cursor = decodeInteractionCursor(rawCursor);
      const post = await findReadablePost(database, viewerId, postId, now);
      if (!post) return null;

      const rows = await database
        .select(commentColumns())
        .from(postComments)
        .innerJoin(user, eq(postComments.authorId, user.id))
        .where(and(
          eq(postComments.postId, postId),
          isNotNull(user.username),
          buildDrizzleCommentVisibilityFilter(database, viewerId),
          cursor === undefined
            ? undefined
            : or(gt(postComments.createdAt, cursor.at), and(eq(postComments.createdAt, cursor.at), gt(postComments.id, cursor.id))),
        ))
        .orderBy(asc(postComments.createdAt), asc(postComments.id))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map((row) => toPostComment(row, viewerId, post.authorId)),
        nextCursor: hasMore && last ? encodeInteractionCursor({ at: last.createdAt, id: last.id }) : null,
        hasMore,
      };
    },
  };
}

/** Workers close the request-scoped Hyperdrive client after each read. */
export function createHyperdrivePostCommentsRepository(hyperdrive: HyperdriveBinding): PostCommentsRepository {
  return {
    listComments: (viewerId, postId, now, limit, cursor) => withHyperdriveDatabase(hyperdrive, (database) => (
      createPostgresPostCommentsRepository(database).listComments(viewerId, postId, now, limit, cursor)
    )),
  };
}
