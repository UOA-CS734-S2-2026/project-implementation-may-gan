import { and, eq, exists, gt, ilike, isNotNull, isNull, lte, not, notExists, or, type SQLWrapper } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { schema, type DayliDatabase } from "@dayli/db";
import type { ProfileDetails } from "./profile-details.contract";

/** How long a changed username must wait, and how long the old handle stays reserved. */
export const USERNAME_CHANGE_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

/** Usernames allow `_`, which is a single-character wildcard in `ILIKE`. */
function exactHandlePattern(username: string) {
  return username.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function notCurrentlyBanned(now: Date) {
  const { user } = schema;
  return or(isNull(user.banned), not(user.banned), and(isNotNull(user.banExpires), lte(user.banExpires, now)));
}

function notBlockedEitherWay(database: DayliDatabase, viewerId: string, otherId: SQLWrapper) {
  const { relationshipBlocks } = schema;
  return notExists(
    database
      .select({ blockerId: relationshipBlocks.blockerId })
      .from(relationshipBlocks)
      .where(and(
        isNull(relationshipBlocks.unblockedAt),
        or(
          and(eq(relationshipBlocks.blockerId, viewerId), eq(relationshipBlocks.blockedId, otherId)),
          and(eq(relationshipBlocks.blockerId, otherId), eq(relationshipBlocks.blockedId, viewerId)),
        ),
      )),
  );
}

/** Both directional rows must be active, as the post visibility filter requires. */
function activeFriends(database: DayliDatabase, viewerId: string, otherId: SQLWrapper) {
  const { friendships } = schema;
  const reciprocal = alias(friendships, "reciprocal");
  return exists(
    database
      .select({ userId: friendships.userId })
      .from(friendships)
      .innerJoin(reciprocal, and(
        eq(reciprocal.userId, friendships.friendId),
        eq(reciprocal.friendId, friendships.userId),
        eq(reciprocal.state, "active"),
      ))
      .where(and(
        eq(friendships.userId, viewerId),
        eq(friendships.friendId, otherId),
        eq(friendships.state, "active"),
      )),
  ).mapWith(Boolean);
}

/**
 * Reads a profile the way the profile card does: a case-insensitive handle
 * that matches exactly one account, not currently banned, and not blocked
 * either way. A handle the owner gave up within the reservation window
 * resolves to their current profile, so old links keep working.
 */
export async function findProfileDetails(
  database: DayliDatabase,
  viewerId: string,
  username: string,
  now: Date,
): Promise<ProfileDetails | null> {
  const { user, usernameReservations } = schema;
  const visible = and(notCurrentlyBanned(now), notBlockedEitherWay(database, viewerId, user.id));
  const columns = {
    id: user.id,
    username: user.username,
    displayUsername: user.displayUsername,
    bio: user.bio,
    profileVisibility: user.profileVisibility,
    usernameChangedAt: user.usernameChangedAt,
    friends: activeFriends(database, viewerId, user.id),
  };

  const current = await database
    .select(columns)
    .from(user)
    .where(and(ilike(user.username, exactHandlePattern(username)), visible))
    .limit(2);
  // Legacy handles that differ only by case are ambiguous, so neither resolves.
  if (current.length > 1) return null;
  const [row] = current.length === 1 ? current : await database
    .select(columns)
    .from(usernameReservations)
    .innerJoin(user, eq(usernameReservations.userId, user.id))
    .where(and(
      eq(usernameReservations.username, username.toLowerCase()),
      gt(usernameReservations.reservedUntil, now),
      isNotNull(user.username),
      visible,
    ))
    .limit(1);
  if (!row?.username) return null;

  const isOwner = row.id === viewerId;
  const detailsVisible = isOwner || row.profileVisibility === "public" || row.friends;
  const changeAvailableAt = row.usernameChangedAt
    ? new Date(row.usernameChangedAt.getTime() + USERNAME_CHANGE_INTERVAL_MS)
    : null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayUsername ?? row.username,
    detailsVisible,
    bio: detailsVisible ? row.bio : null,
    owner: isOwner
      ? {
        profileVisibility: row.profileVisibility,
        usernameChangeAvailableAt: changeAvailableAt && changeAvailableAt > now ? changeAvailableAt.toISOString() : null,
      }
      : null,
  };
}
