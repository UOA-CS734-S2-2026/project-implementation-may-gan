import { and, eq } from "drizzle-orm";
import { schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { withHyperdriveDatabase } from "../../../infrastructure/database/hyperdrive";
import { buildDrizzleCommentVisibilityFilter } from "../../permissions";
import type { PostComment } from "../shared/interactions.contract";
import { readComment, toPostComment } from "../shared/post-comment.projection";
import { findReadablePost } from "../shared/readable-post";

export interface UpdatePostCommentRepository {
  /** Null when the post, the comment, or a reply's parent is hidden or deleted, or the comment isn't the viewer's own. */
  updateComment(viewerId: string, postId: string, commentId: string, text: string, now: Date): Promise<PostComment | null>;
}

/**
 * Only the commenter edits a comment, and only while the viewer could still
 * list it: the same visibility rule as lists and counts, so a reply under a
 * deleted or blocked parent can't be edited. Saving the same text again
 * changes nothing.
 */
export function createPostgresUpdatePostCommentRepository(database: DayliDatabase): UpdatePostCommentRepository {
  const { postComments } = schema;
  return {
    updateComment(viewerId, postId, commentId, text, now) {
      return database.transaction(async (tx) => {
        const post = await findReadablePost(tx, viewerId, postId, now);
        if (!post) return null;
        const [comment] = await tx
          .select({ body: postComments.body })
          .from(postComments)
          .where(and(
            eq(postComments.id, commentId),
            eq(postComments.postId, postId),
            eq(postComments.authorId, viewerId),
            buildDrizzleCommentVisibilityFilter(tx, viewerId),
          ))
          .for("update");
        if (!comment) return null;
        if (comment.body !== text) {
          await tx.update(postComments).set({ body: text, editedAt: now }).where(eq(postComments.id, commentId));
        }
        const row = await readComment(tx, commentId);
        return row ? toPostComment(row, viewerId, post.authorId) : null;
      });
    },
  };
}

/** Workers close the request-scoped Hyperdrive client after each edit. */
export function createHyperdriveUpdatePostCommentRepository(hyperdrive: HyperdriveBinding): UpdatePostCommentRepository {
  return {
    updateComment: (viewerId, postId, commentId, text, now) => withHyperdriveDatabase(hyperdrive, (database) => (
      createPostgresUpdatePostCommentRepository(database).updateComment(viewerId, postId, commentId, text, now)
    )),
  };
}
