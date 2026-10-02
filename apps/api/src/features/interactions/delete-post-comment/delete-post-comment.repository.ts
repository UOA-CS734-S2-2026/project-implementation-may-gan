import { and, eq, isNull } from "drizzle-orm";
import { schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { withHyperdriveDatabase } from "../../../infrastructure/database/hyperdrive";
import { findReadablePost } from "../shared/readable-post";

export interface DeletePostCommentRepository {
  /** False when the post or comment is hidden, or the viewer may not delete it. */
  deleteComment(viewerId: string, postId: string, commentId: string, now: Date): Promise<boolean>;
}

/**
 * The commenter or the post's author can delete a comment. Deleting a
 * top-level comment also hides its replies. Deleting again succeeds and keeps
 * the first deletion.
 */
export function createPostgresDeletePostCommentRepository(database: DayliDatabase): DeletePostCommentRepository {
  const { postComments } = schema;
  return {
    deleteComment(viewerId, postId, commentId, now) {
      return database.transaction(async (tx) => {
        const post = await findReadablePost(tx, viewerId, postId, now);
        if (!post) return false;
        const [comment] = await tx
          .select({ authorId: postComments.authorId, deletedAt: postComments.deletedAt })
          .from(postComments)
          .where(and(eq(postComments.id, commentId), eq(postComments.postId, postId)))
          .for("update");
        if (!comment || (comment.authorId !== viewerId && post.authorId !== viewerId)) return false;
        if (!comment.deletedAt) {
          await tx
            .update(postComments)
            .set({ deletedAt: now, deletedBy: viewerId })
            .where(and(eq(postComments.id, commentId), isNull(postComments.deletedAt)));
        }
        return true;
      });
    },
  };
}

/** Workers close the request-scoped Hyperdrive client after each deletion. */
export function createHyperdriveDeletePostCommentRepository(hyperdrive: HyperdriveBinding): DeletePostCommentRepository {
  return {
    deleteComment: (viewerId, postId, commentId, now) => withHyperdriveDatabase(hyperdrive, (database) => (
      createPostgresDeletePostCommentRepository(database).deleteComment(viewerId, postId, commentId, now)
    )),
  };
}
