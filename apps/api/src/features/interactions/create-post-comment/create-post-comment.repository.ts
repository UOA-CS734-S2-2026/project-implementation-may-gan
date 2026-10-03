import { and, eq, isNull } from "drizzle-orm";
import { classifyPostgresConstraintError, schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { withHyperdriveDatabase } from "../../../infrastructure/database/hyperdrive";
import { buildDrizzleCommentVisibilityFilter } from "../../permissions";
import type { PostComment } from "../shared/interactions.contract";
import { readComment, toPostComment } from "../shared/post-comment.projection";
import { findReadablePost } from "../shared/readable-post";
import type { CreatePostCommentRequest } from "./create-post-comment.contract";

export type CreatePostCommentOutcome =
  | { kind: "created" | "replayed"; comment: PostComment }
  | { kind: "not_found" | "invalid_parent" | "conflict" };

export interface CreatePostCommentRepository {
  createComment(viewerId: string, postId: string, request: CreatePostCommentRequest, now: Date): Promise<CreatePostCommentOutcome>;
}

/**
 * Adds a comment or a one-level reply. A retry with the same clientCommentId
 * returns the comment already made, so an offline retry never duplicates it.
 */
/** A concurrent request with the same clientCommentId committed first. */
class CommentInsertRaceError extends Error {}

export function createPostgresCreatePostCommentRepository(database: DayliDatabase): CreatePostCommentRepository {
  const { postComments } = schema;

  async function replay(
    tx: Pick<DayliDatabase, "select">,
    viewerId: string,
    postId: string,
    postAuthorId: string,
    request: CreatePostCommentRequest,
  ): Promise<CreatePostCommentOutcome | null> {
    const [existing] = await tx
      .select({
        id: postComments.id,
        postId: postComments.postId,
        parentCommentId: postComments.parentCommentId,
        body: postComments.body,
        deletedAt: postComments.deletedAt,
      })
      .from(postComments)
      .where(and(eq(postComments.authorId, viewerId), eq(postComments.clientCommentId, request.clientCommentId)))
      .limit(1);
    if (!existing) return null;
    const same = existing.postId === postId
      && existing.parentCommentId === (request.parentCommentId ?? null)
      && existing.body === request.text;
    if (!same) return { kind: "conflict" };
    // The comment was made and then deleted; the retry has nothing to show.
    if (existing.deletedAt) return { kind: "not_found" };
    const row = await readComment(tx, existing.id);
    return row ? { kind: "replayed", comment: toPostComment(row, viewerId, postAuthorId) } : { kind: "not_found" };
  }

  function attempt(viewerId: string, postId: string, request: CreatePostCommentRequest, now: Date) {
    return database.transaction(async (tx): Promise<CreatePostCommentOutcome> => {
      const post = await findReadablePost(tx, viewerId, postId, now);
      if (!post) return { kind: "not_found" };

      const replayed = await replay(tx, viewerId, postId, post.authorId, request);
      if (replayed) return replayed;

      if (request.parentCommentId) {
        const [parent] = await tx
          .select({ id: postComments.id })
          .from(postComments)
          .where(and(
            eq(postComments.id, request.parentCommentId),
            eq(postComments.postId, postId),
            isNull(postComments.parentCommentId),
            buildDrizzleCommentVisibilityFilter(tx, viewerId),
          ))
          .for("share")
          .limit(1);
        if (!parent) return { kind: "invalid_parent" };
      }

      const id = crypto.randomUUID();
      try {
        await tx.insert(postComments).values({
          id,
          postId,
          authorId: viewerId,
          parentCommentId: request.parentCommentId ?? null,
          clientCommentId: request.clientCommentId,
          body: request.text,
          createdAt: now,
        });
      } catch (error) {
        if (classifyPostgresConstraintError(error) === "unique") throw new CommentInsertRaceError();
        throw error;
      }
      const row = await readComment(tx, id);
      if (!row) throw new Error("The inserted comment could not be read back.");
      return { kind: "created", comment: toPostComment(row, viewerId, post.authorId) };
    });
  }

  return {
    async createComment(viewerId, postId, request, now) {
      try {
        return await attempt(viewerId, postId, request, now);
      } catch (error) {
        // The racing request committed the comment; a second attempt replays it.
        if (error instanceof CommentInsertRaceError) return attempt(viewerId, postId, request, now);
        throw error;
      }
    },
  };
}

/** Workers close the request-scoped Hyperdrive client after each comment. */
export function createHyperdriveCreatePostCommentRepository(hyperdrive: HyperdriveBinding): CreatePostCommentRepository {
  return {
    createComment: (viewerId, postId, request, now) => withHyperdriveDatabase(hyperdrive, (database) => (
      createPostgresCreatePostCommentRepository(database).createComment(viewerId, postId, request, now)
    )),
  };
}
