import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { audioContentTypes, type AudioContentType } from "@dayli/contracts";
import { withHyperdriveDatabase } from "../../../infrastructure/database/hyperdrive";
import { buildDrizzlePostVisibilityFilter } from "../../permissions";
import type { PostVoiceMemoRef } from "../shared/post-media";

export interface PostVoiceMemoRepository {
  /** Null unless the post has an attached voice memo the viewer may read now. */
  findVoiceMemo(
    viewerId: string | null,
    postId: string,
    now: Date,
    access?: "private" | "parent-authorized",
  ): Promise<PostVoiceMemoRef | null>;
}

/**
 * Uses the permission module's media action: the same post rules as detail
 * (deletion, blocks, audience, release), plus a live, attached post_media row.
 */
export function createPostgresPostVoiceMemoRepository(database: DayliDatabase): PostVoiceMemoRepository {
  const { posts, user, postMedia, mediaReservation } = schema;
  return {
    async findVoiceMemo(viewerId, postId, now, access = "private") {
      // The id alone reveals nothing: it is returned only if the filter below passes.
      const [attached] = await database
        .select({ id: postMedia.id })
        .from(postMedia)
        .innerJoin(mediaReservation, eq(mediaReservation.id, postMedia.reservationId))
        .where(and(
          eq(postMedia.postId, postId),
          isNull(postMedia.detachedAt),
          inArray(mediaReservation.contentType, [...audioContentTypes]),
        ))
        .limit(1);
      if (!attached) return null;

      const [row] = await database
        .select({
          id: postMedia.id,
          postId: postMedia.postId,
          contentType: mediaReservation.contentType,
          objectKey: mediaReservation.objectKey,
        })
        .from(postMedia)
        .innerJoin(posts, eq(postMedia.postId, posts.id))
        .innerJoin(user, eq(posts.authorId, user.id))
        .innerJoin(mediaReservation, eq(mediaReservation.id, postMedia.reservationId))
        .where(and(
          eq(postMedia.postId, postId),
          eq(postMedia.id, attached.id),
          buildDrizzlePostVisibilityFilter(database, {
            viewer: { userId: viewerId },
            now,
            action: access === "parent-authorized" ? "media" : "private-media",
            mediaId: attached.id,
          }),
          isNotNull(user.username),
        ))
        .limit(1);
      // The query above only selects audio reservations.
      return row ? { ...row, contentType: row.contentType as AudioContentType } : null;
    },
  };
}

/** Workers close the request-scoped Hyperdrive client after each read. */
export function createHyperdrivePostVoiceMemoRepository(hyperdrive: HyperdriveBinding): PostVoiceMemoRepository {
  return {
    findVoiceMemo: (...args) => withHyperdriveDatabase(hyperdrive, (database) => (
      createPostgresPostVoiceMemoRepository(database).findVoiceMemo(...args)
    )),
  };
}
