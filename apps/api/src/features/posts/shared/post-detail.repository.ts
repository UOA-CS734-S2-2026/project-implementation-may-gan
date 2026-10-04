import { and, count, eq, isNotNull, sql } from "drizzle-orm";
import { schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { withHyperdriveDatabase } from "../../../infrastructure/database/hyperdrive";
import { buildDrizzlePostVisibilityFilter, findPrivatelyVisiblePostMedia } from "../../permissions";
import { readInteractionCounts } from "./post-interaction-counts";
import {
  readAttachedVoiceMemo,
  readAttachedMedia,
  type PostVoiceMemoRef,
  type PostMediaRef,
} from "./post-media";
import { visibleRevisions } from "./post-revisions";
import type { PostDetail } from "./post-detail.contract";
import { readStoredWeather } from "./post-weather";

/** The post with its media not yet signed; the route signs it for the response. */
export type PostDetailRecord = Omit<PostDetail, "media" | "voiceMemo"> & {
  media: PostMediaRef[];
  voiceMemo: PostVoiceMemoRef | null;
  /** True when media must use the parent-authorized Worker route. */
  publicMediaDelivery: boolean;
};

export interface PostDetailRepository {
  /** Null when the post is absent or the viewer may not read it. */
  findPost(viewerId: string | null, postId: string, now: Date): Promise<PostDetailRecord | null>;
}

/**
 * Reads one post through the shared detail predicate, the same one the feed
 * uses for authorization. The owner may read solo and unreleased posts. A
 * released friends post is also readable by active friends and, for detail,
 * anyone when its author has a public profile.
 */
export function createPostgresPostDetailRepository(database: DayliDatabase): PostDetailRepository {
  const { posts, user, dailyPrompts, postRevisions } = schema;
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
          weatherCondition: posts.weatherCondition,
          weatherTemperatureC: posts.weatherTemperatureC,
          weatherPlaceName: posts.weatherPlaceName,
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
      const interactions = (await readInteractionCounts(database, viewerId, [row.id]))(row.id);
      const media = (await readAttachedMedia(database, [row.id])).get(row.id) ?? [];
      const voiceMemo = await readAttachedVoiceMemo(database, row.id);
      const attachedMediaId = media[0]?.id ?? voiceMemo?.id;
      const publicMediaDelivery = attachedMediaId !== undefined && !(await findPrivatelyVisiblePostMedia(
        database,
        row.id,
        attachedMediaId,
        { viewer: { userId: viewerId }, now },
      ));
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
        ...interactions,
        viewerIsAuthor,
        media,
        voiceMemo,
        weather: readStoredWeather(row),
        publicMediaDelivery,
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
