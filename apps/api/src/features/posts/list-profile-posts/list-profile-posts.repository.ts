import { and, desc, eq, exists, ilike, isNotNull, isNull, lte, not, notExists, or, sql } from "drizzle-orm";
import { schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { withHyperdriveDatabase } from "../../../infrastructure/database/hyperdrive";
import { buildDrizzleActiveAccountFilter, buildDrizzlePostVisibilityFilter } from "../../permissions";
import { postEdited } from "../shared/post-edited";
import { afterPostCursor, decodePostCursor, encodePostCursor } from "../shared/post-page-cursor";
import { readInteractionCounts } from "../shared/post-interaction-counts";
import { readAttachedMedia, type PostMediaRef } from "../shared/post-media";
import type { ProfilePost, ProfilePostsPage, RestrictedProfilePosts } from "./list-profile-posts.contract";

/** A profile post with its media not yet signed; the route signs it for the response. */
export type ProfilePostRecord = Omit<ProfilePost, "media"> & { media: PostMediaRef[] };
export type ProfilePostsPageRecord = Omit<ProfilePostsPage, "items"> & {
  accessTier: "authorized" | "public";
  items: ProfilePostRecord[];
};
export type ReadableProfilePostsRecord = ProfilePostsPageRecord | RestrictedProfilePosts;

export interface ProfilePostsRepository {
  /** Null when the profile is unknown, inactive, banned, or blocked in either direction. */
  listProfilePosts(viewerId: string | null, username: string, now: Date, limit: number, cursor?: string): Promise<ReadableProfilePostsRecord | null>;
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
async function findProfileOwner(database: DayliDatabase, viewerId: string | null, username: string, now: Date) {
  const { user, relationshipBlocks, friendships } = schema;
  const friends = viewerId === null ? sql<boolean>`false` : and(
    exists(database.select({ friendId: friendships.friendId }).from(friendships).where(and(
      eq(friendships.userId, user.id),
      eq(friendships.friendId, viewerId),
      eq(friendships.state, "active"),
    ))),
    exists(database.select({ friendId: friendships.friendId }).from(friendships).where(and(
      eq(friendships.userId, viewerId),
      eq(friendships.friendId, user.id),
      eq(friendships.state, "active"),
    ))),
  )!.mapWith(Boolean);
  const notBlocked = viewerId === null ? sql`true` : notExists(
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
  );
  const matches = await database
    .select({ id: user.id, username: user.username, profileVisibility: user.profileVisibility, friends })
    .from(user)
    .where(and(
      buildDrizzleActiveAccountFilter(database, user.id),
      ilike(user.username, exactHandlePattern(username)),
      or(isNull(user.banned), not(user.banned), and(isNotNull(user.banExpires), lte(user.banExpires, now))),
      notBlocked,
    ))
    .limit(2);
  // Legacy handles that differ only by case are ambiguous, so neither resolves.
  return matches.length === 1 ? matches[0]! : null;
}

/**
 * Lists one person's posts, newest Auckland day first, through the shared
 * visibility predicate. The owner sees every post, including solo and
 * unreleased ones. Active friends see released `friends` posts, as does anyone
 * for a public account. The predicate is applied before the
 * keyset limit, so a hidden post never leaves a hole in, or leaks into, a page.
 */
export function createPostgresProfilePostsRepository(database: DayliDatabase): ProfilePostsRepository {
  const { posts, user, dailyPrompts } = schema;
  return {
    async listProfilePosts(viewerId, username, now, limit, rawCursor) {
      const cursor = decodePostCursor(rawCursor);
      const author = await findProfileOwner(database, viewerId, username, now);
      if (!author?.username) return null;
      const authorized = viewerId === author.id || author.friends;
      if (author.profileVisibility === "private" && !authorized) {
        return { kind: "restricted", username: author.username };
      }

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
          eq(posts.authorId, author.id),
          buildDrizzlePostVisibilityFilter(database, { viewer: { userId: viewerId }, now, action: "profile" }),
          isNotNull(user.username),
          afterPostCursor(cursor),
        ))
        .orderBy(desc(posts.localDate), desc(posts.id))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      const media = await readAttachedMedia(database, page.map((row) => row.id));
      const interactions = await readInteractionCounts(database, viewerId, page.map((row) => row.id));
      return {
        accessTier: authorized ? "authorized" : "public",
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
          ...interactions(row.id),
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
