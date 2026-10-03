import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { withHyperdriveDatabase } from "../../../infrastructure/database/hyperdrive";
import { buildDrizzlePostVisibilityFilter } from "../../permissions";
import { postEdited } from "../shared/post-edited";
import { readAttachedMedia, type PostMediaRef } from "../shared/post-media";
import { afterPostCursor, decodePostCursor, encodePostCursor } from "../shared/post-page-cursor";
import { findProfileOwner } from "../shared/profile-owner";
import type { ProfilePost, ProfilePostsPage } from "./list-profile-posts.contract";

/** A profile post with its media not yet signed; the route signs it for the response. */
export type ProfilePostRecord = Omit<ProfilePost, "media"> & { media: PostMediaRef[] };
export type ProfilePostsPageRecord = Omit<ProfilePostsPage, "items"> & { items: ProfilePostRecord[] };

export interface ProfilePostsRepository {
  /** Null when the profile is unknown, banned, or blocked in either direction. */
  listProfilePosts(viewerId: string, username: string, now: Date, limit: number, cursor?: string): Promise<ProfilePostsPageRecord | null>;
}

/**
 * Lists one person's posts, newest Auckland day first, through the shared
 * visibility predicate. The owner sees every post, including solo and
 * unreleased ones; anyone else sees released `friends` posts only while an
 * unblocked, active friendship exists. The predicate is applied before the
 * keyset limit, so a hidden post never leaves a hole in, or leaks into, a page.
 */
export function createPostgresProfilePostsRepository(database: DayliDatabase): ProfilePostsRepository {
  const { posts, user, dailyPrompts } = schema;
  return {
    async listProfilePosts(viewerId, username, now, limit, rawCursor) {
      const cursor = decodePostCursor(rawCursor);
      const authorId = await findProfileOwner(database, viewerId, username, now);
      if (!authorId) return null;

      const rows = await database
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
          edited: postEdited(viewerId),
        })
        .from(posts)
        .innerJoin(user, eq(posts.authorId, user.id))
        .innerJoin(dailyPrompts, eq(posts.promptId, dailyPrompts.id))
        .where(and(
          eq(posts.authorId, authorId),
          buildDrizzlePostVisibilityFilter(database, { viewer: { userId: viewerId }, now, action: "list" }),
          isNotNull(user.username),
          afterPostCursor(cursor),
        ))
        .orderBy(desc(posts.localDate), desc(posts.id))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      const media = await readAttachedMedia(database, page.map((row) => row.id));
      return {
        items: page.map((row): ProfilePostRecord => ({
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
          released: row.releasedAt <= now,
          edited: row.edited,
          media: media.get(row.id) ?? [],
        })),
        hasMore,
        nextCursor: hasMore && last ? encodePostCursor({ localDate: last.localDate, id: last.id }) : null,
      };
    },
  };
}

/** Workers close the request-scoped Hyperdrive client after each page. */
export function createHyperdriveProfilePostsRepository(hyperdrive: HyperdriveBinding): ProfilePostsRepository {
  return {
    listProfilePosts: (viewerId, username, now, limit, cursor) => withHyperdriveDatabase(hyperdrive, (database) => (
      createPostgresProfilePostsRepository(database).listProfilePosts(viewerId, username, now, limit, cursor)
    )),
  };
}
