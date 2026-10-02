import { and, asc, eq, gte, isNull, lte, min } from "drizzle-orm";
import { schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { getAucklandDay, moodHistoryWindow, summarizeMoodHistory, type MoodHistory, type MoodHistoryRange } from "@dayli/domain";
import { withHyperdriveDatabase } from "../../../infrastructure/database/hyperdrive";

export interface MoodHistoryRepository {
  /** Null when the account no longer exists. */
  findMoodHistory(userId: string, range: MoodHistoryRange, now: Date): Promise<MoodHistory | null>;
}

/**
 * Reads only the caller's own posts, so solo and unreleased ones count and no
 * visibility rule applies. Deleted posts are gone from the history at once.
 * Both periods together span at most two years of one-per-day rows.
 */
export async function findMoodHistory(database: DayliDatabase, userId: string, range: MoodHistoryRange, now: Date): Promise<MoodHistory | null> {
  const { posts, user } = schema;
  const [account] = await database.select({ createdAt: user.createdAt }).from(user).where(eq(user.id, userId)).limit(1);
  if (!account) return null;

  const today = getAucklandDay(() => now).localDate;
  const window = moodHistoryWindow(range, today);
  const live = and(eq(posts.authorId, userId), isNull(posts.deletedAt));
  const [[first], ratings] = await Promise.all([
    database.select({ localDate: min(posts.localDate) }).from(posts).where(live),
    database
      .select({ localDate: posts.localDate, rating: posts.rating })
      .from(posts)
      .where(and(live, gte(posts.localDate, window.previousFrom), lte(posts.localDate, today)))
      .orderBy(asc(posts.localDate)),
  ]);

  // Imported accounts can have posts from before their account row was created.
  const joined = getAucklandDay(() => account.createdAt).localDate;
  const trackedFrom = first?.localDate && first.localDate < joined ? first.localDate as typeof joined : joined;
  return summarizeMoodHistory(range, today, trackedFrom, ratings);
}

export function createPostgresMoodHistoryRepository(database: DayliDatabase): MoodHistoryRepository {
  return { findMoodHistory: (userId, range, now) => findMoodHistory(database, userId, range, now) };
}

/** Workers close the request-scoped Hyperdrive client after each read. */
export function createHyperdriveMoodHistoryRepository(hyperdrive: HyperdriveBinding): MoodHistoryRepository {
  return {
    findMoodHistory: (userId, range, now) => withHyperdriveDatabase(hyperdrive, (database) => findMoodHistory(database, userId, range, now)),
  };
}
