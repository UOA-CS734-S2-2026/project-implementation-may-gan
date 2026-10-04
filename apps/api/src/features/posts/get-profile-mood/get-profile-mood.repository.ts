import { and, asc, count, eq, gte, isNull, lte, min, or } from "drizzle-orm";
import { schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { getAucklandDay, moodHistoryWindow, summarizeMoodHistory, type MoodHistory, type MoodHistoryRange } from "@dayli/domain";
import { withHyperdriveDatabase } from "../../../infrastructure/database/hyperdrive";
import { buildDrizzlePostVisibilityFilter } from "../../permissions";
import { findProfileOwner } from "../shared/profile-owner";

export type ProfileMoodOutcome =
  | { kind: "found"; history: MoodHistory }
  /** Unknown, banned, or blocked in either direction. */
  | { kind: "notFound" }
  /** Anyone other than the owner or an active friend. */
  | { kind: "forbidden" };

export interface ProfileMoodRepository {
  findProfileMood(viewerId: string, username: string, range: MoodHistoryRange, now: Date): Promise<ProfileMoodOutcome>;
}

/** Friendships are stored in both directions; both must be active, as for posts. */
async function areActiveFriends(database: DayliDatabase, ownerId: string, viewerId: string) {
  const { friendships } = schema;
  const [row] = await database
    .select({ rows: count() })
    .from(friendships)
    .where(and(
      eq(friendships.state, "active"),
      or(
        and(eq(friendships.userId, ownerId), eq(friendships.friendId, viewerId)),
        and(eq(friendships.userId, viewerId), eq(friendships.friendId, ownerId)),
      ),
    ));
  return row?.rows === 2;
}

/**
 * A profile's ratings, with the same reach as its posts. Ratings come through
 * the shared post visibility predicate, so the owner sees solo and unreleased
 * posts and a friend sees released `friends` posts only. The author's other
 * posted days are returned without ratings, so a solo day is never shown as
 * missing. Both periods together span at most two years of one-per-day rows.
 */
export async function findProfileMood(
  database: DayliDatabase,
  viewerId: string,
  username: string,
  range: MoodHistoryRange,
  now: Date,
): Promise<ProfileMoodOutcome> {
  const ownerId = await findProfileOwner(database, viewerId, username, now);
  if (!ownerId) return { kind: "notFound" };
  if (ownerId !== viewerId && !await areActiveFriends(database, ownerId, viewerId)) return { kind: "forbidden" };

  const { posts, user } = schema;
  const today = getAucklandDay(() => now).localDate;
  const window = moodHistoryWindow(range, today);
  const live = and(eq(posts.authorId, ownerId), isNull(posts.trashedAt));
  const inWindow = and(gte(posts.localDate, window.previousFrom), lte(posts.localDate, today));
  const [[account], [first], ratings, postedDays] = await Promise.all([
    database.select({ createdAt: user.createdAt }).from(user).where(eq(user.id, ownerId)).limit(1),
    database.select({ localDate: min(posts.localDate) }).from(posts).where(live),
    database
      .select({ localDate: posts.localDate, rating: posts.rating })
      .from(posts)
      .where(and(
        eq(posts.authorId, ownerId),
        inWindow,
        buildDrizzlePostVisibilityFilter(database, { viewer: { userId: viewerId }, now, action: "list" }),
      ))
      .orderBy(asc(posts.localDate)),
    database.select({ localDate: posts.localDate }).from(posts).where(and(live, inWindow)),
  ]);
  if (!account) return { kind: "notFound" };

  // Imported accounts can have posts from before their account row was created.
  const joined = getAucklandDay(() => account.createdAt).localDate;
  const trackedFrom = first?.localDate && first.localDate < joined ? first.localDate as typeof joined : joined;
  const rated = new Set(ratings.map((row) => row.localDate));
  const hidden = postedDays.map((row) => row.localDate).filter((date) => !rated.has(date));
  return { kind: "found", history: summarizeMoodHistory(range, today, trackedFrom, ratings, hidden) };
}

export function createPostgresProfileMoodRepository(database: DayliDatabase): ProfileMoodRepository {
  return { findProfileMood: (viewerId, username, range, now) => findProfileMood(database, viewerId, username, range, now) };
}

/** Workers close the request-scoped Hyperdrive client after each read. */
export function createHyperdriveProfileMoodRepository(hyperdrive: HyperdriveBinding): ProfileMoodRepository {
  return {
    findProfileMood: (viewerId, username, range, now) => withHyperdriveDatabase(hyperdrive, (database) => (
      findProfileMood(database, viewerId, username, range, now)
    )),
  };
}
