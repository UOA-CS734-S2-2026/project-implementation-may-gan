import { and, asc, count, eq, isNull } from "drizzle-orm";
import { schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { withHyperdriveDatabase } from "../../../infrastructure/database/hyperdrive";
import type { UpdatePostChanges } from "./update-post.contract";

/**
 * `updated` saved a new version. `unchanged` means the post already holds these
 * values, which is also how a retry of a saved edit ends.
 */
export type UpdatePostOutcome = "updated" | "unchanged" | "not_found" | "conflict";

export interface UpdatePostRepository {
  updatePost(
    authorId: string,
    postId: string,
    expectedRevisionCount: number,
    changes: UpdatePostChanges,
    now: Date,
  ): Promise<UpdatePostOutcome>;
}

const editableFields = ["reflectiveAnswer", "caption", "rating", "audience"] as const;

/**
 * Saves an edit by the author. The post row is locked, so concurrent edits
 * queue; the first wins and the rest see a changed revision count. The prior
 * version is stored as an immutable revision in the same transaction.
 */
export function createPostgresUpdatePostRepository(database: DayliDatabase): UpdatePostRepository {
  const { posts, postRevisions, postMedia } = schema;
  return {
    updatePost(authorId, postId, expectedRevisionCount, changes, now) {
      return database.transaction(async (tx) => {
        const [post] = await tx
          .select()
          .from(posts)
          .where(and(eq(posts.id, postId), eq(posts.authorId, authorId), isNull(posts.trashedAt)))
          .for("update");
        if (!post) return "not_found";

        const changed = editableFields.filter((field) => changes[field] !== undefined && changes[field] !== post[field]);
        if (changed.length === 0) return "unchanged";

        const [revisions] = await tx
          .select({ count: count() })
          .from(postRevisions)
          .where(eq(postRevisions.postId, postId));
        const revisionCount = revisions?.count ?? 0;
        if (revisionCount !== expectedRevisionCount) return "conflict";

        // Media can't be edited, but each revision records what was attached.
        const attached = await tx
          .select({ id: postMedia.id, order: postMedia.attachmentOrder })
          .from(postMedia)
          .where(and(eq(postMedia.postId, postId), isNull(postMedia.detachedAt)))
          .orderBy(asc(postMedia.attachmentOrder));

        await tx.insert(postRevisions).values({
          id: crypto.randomUUID(),
          postId,
          revisionNumber: revisionCount + 1,
          previousReflectiveAnswer: post.reflectiveAnswer,
          previousCaption: post.caption,
          previousRating: post.rating,
          previousAudience: post.audience,
          previousPromptId: post.promptId,
          previousAttachmentRefs: attached.map((media) => ({
            media_id: media.id,
            attachment_order: media.order,
            status: "attached" as const,
          })),
          createdAt: now,
        });
        await tx
          .update(posts)
          .set({
            ...(changes.reflectiveAnswer !== undefined ? { reflectiveAnswer: changes.reflectiveAnswer } : {}),
            ...(changes.caption !== undefined ? { caption: changes.caption } : {}),
            ...(changes.rating !== undefined ? { rating: changes.rating } : {}),
            ...(changes.audience !== undefined ? { audience: changes.audience } : {}),
            updatedAt: now,
          })
          .where(eq(posts.id, postId));
        return "updated";
      });
    },
  };
}

/** Workers close the request-scoped Hyperdrive client after each edit. */
export function createHyperdriveUpdatePostRepository(hyperdrive: HyperdriveBinding): UpdatePostRepository {
  return {
    updatePost: (authorId, postId, expectedRevisionCount, changes, now) => withHyperdriveDatabase(hyperdrive, (database) => (
      createPostgresUpdatePostRepository(database).updatePost(authorId, postId, expectedRevisionCount, changes, now)
    )),
  };
}
