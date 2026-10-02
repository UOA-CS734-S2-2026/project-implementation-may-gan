import { and, desc, eq, ilike, isNotNull, isNull, lte, not, notExists, or, sql } from "drizzle-orm";
import { schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { withHyperdriveDatabase } from "../../../infrastructure/database/hyperdrive";
import { buildDrizzleActiveAccountFilter, buildDrizzlePostVisibilityFilter } from "../../permissions";
import { postEdited } from "../shared/post-edited";
import { afterPostCursor, decodePostCursor, encodePostCursor } from "../shared/post-page-cursor";
import { readAttachedMedia, type PostMediaRef } from "../shared/post-media";
import type { ProfilePost, ProfilePostsPage } from "./list-profile-posts.contract";

/** A profile post with its media not yet signed; the route signs it for the response. */
export type ProfilePostRecord = Omit<ProfilePost, "media"> & { media: PostMediaRef[] };
export type ProfilePostsPageRecord = Omit<ProfilePostsPage, "items"> & { items: ProfilePostRecord[] };

export interface ProfilePostsRepository {
  /** Null when the profile is unknown, banned, or blocked in either direction. */
  listProfilePosts(viewerId: string, username: string, now: Date, limit: number, cursor?: string): Promise<ProfilePostsPageRecord | null>;
}

/** Usernames allow `_`, which is a single-character wildcard in `ILIKE`. */
function exactHandlePattern(username: string) {
  return username.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

/**
 * Finds the profile owner the same way the profile card does: a
 * case-insensitive handle that matches exactly one account, not currently
 * banned, and not blocked either way.
 */
async function findProfileOwner(database: DayliDatabase, viewerId: string, username: string, now: Date) {
  const { user, relationshipBlocks } = schema;
  const matches = await database
    .select({ id: user.id })
    .from(user)
    .where(and(
      buildDrizzleActiveAccountFilter(database, user.id),
      ilike(user.username, exactHandlePattern(username)),
      or(isNull(user.banned), not(user.banned), and(isNotNull(user.banExpires), lte(user.banExpires, now))),
      notExists(
        database
          .select({ blockerId: relationshipBlocks.blockerId })
          .from(relationshipBlocks)
          .where(and(
            isNull(relationshipBlocks.unblockedAt),
            or(
              and(eq(relationshipBlocks.blockerId, viewerId), eq(relationshipBlocks.blockedId, user.id)),
              and(eq(relationshipBlocks.blockerId, user.id), eq(relationshipBlocks.blockedId, viewerId)),
            ),
          )),
      ),
    ))
    .limit(2);
  // Legacy handles that differ only by case are ambiguous, so neither resolves.
  return matches.length === 1 ? matches[0]!.id : null;
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
          edited: postEdited(),
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
