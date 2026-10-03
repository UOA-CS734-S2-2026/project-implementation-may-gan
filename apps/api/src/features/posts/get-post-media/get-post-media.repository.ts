import { and, eq, isNotNull, notInArray } from "drizzle-orm";
import { schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { audioContentTypes, type VisualContentType } from "@dayli/contracts";
import { withHyperdriveDatabase } from "../../../infrastructure/database/hyperdrive";
import { buildDrizzlePostVisibilityFilter } from "../../permissions";
import type { PostMediaRef } from "../shared/post-media";

export interface PostMediaRepository {
  /** Null unless the media is attached to a post the viewer may read now. */
  findMedia(
    viewerId: string | null,
    postId: string,
    mediaId: string,
    now: Date,
    access?: "private" | "parent-authorized",
  ): Promise<PostMediaRef | null>;
}

/**
 * Uses the permission module's media action: the same post rules as detail,
 * plus a live, attached post_media row. A revision's old media never counts.
 */
export function createPostgresPostMediaRepository(database: DayliDatabase): PostMediaRepository {
  const { posts, user, postMedia, mediaReservation } = schema;
  return {
    async findMedia(viewerId, postId, mediaId, now, access = "private") {
      const [row] = await database
        .select({
          id: postMedia.id,
          postId: postMedia.postId,
          order: postMedia.attachmentOrder,
          contentType: mediaReservation.contentType,
          objectKey: mediaReservation.objectKey,
        })
        .from(postMedia)
        .innerJoin(posts, eq(postMedia.postId, posts.id))
        .innerJoin(user, eq(posts.authorId, user.id))
        .innerJoin(mediaReservation, eq(mediaReservation.id, postMedia.reservationId))
        .where(and(
          eq(postMedia.postId, postId),
          eq(postMedia.id, mediaId),
          buildDrizzlePostVisibilityFilter(database, {
            viewer: { userId: viewerId },
            now,
            action: access === "parent-authorized" ? "media" : "private-media",
            mediaId,
          }),
          // Voice memos are served by their own route.
          notInArray(mediaReservation.contentType, [...audioContentTypes]),
          isNotNull(user.username),
        ))
        .limit(1);
      // A reservation only ever stores an allowed type.
      return row ? { ...row, contentType: row.contentType as VisualContentType } : null;
    },
  };
}

/** Workers close the request-scoped Hyperdrive client after each read. */
export function createHyperdrivePostMediaRepository(hyperdrive: HyperdriveBinding): PostMediaRepository {
  return {
    findMedia: (...args) => withHyperdriveDatabase(hyperdrive, (database) => (
      createPostgresPostMediaRepository(database).findMedia(...args)
    )),
  };
}
