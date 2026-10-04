import { and, eq, ilike, isNotNull, isNull, lte, not, notExists, or } from "drizzle-orm";
import { schema, type DayliDatabase } from "@dayli/db";
import { buildDrizzleActiveAccountFilter } from "../../permissions";

/** Usernames allow `_`, which is a single-character wildcard in `ILIKE`. */
function exactHandlePattern(username: string) {
  return username.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

/**
 * Finds the profile owner the same way the profile card does: a
 * case-insensitive handle that matches exactly one active account, not
 * currently banned, and not blocked either way.
 */
export async function findProfileOwner(database: DayliDatabase, viewerId: string, username: string, now: Date) {
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
