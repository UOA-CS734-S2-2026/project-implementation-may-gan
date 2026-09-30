import { and, asc, eq, isNotNull, isNull, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { schema, type DayliDatabase } from "@dayli/db";
import type { RelationshipUserCard, RelationshipUserPage } from "./relationship-service";
import { RelationshipStoreError } from "./relationship-service";
import type { RelationshipQueryable } from "./relationship-postgres";

type FriendRow = {
  id: string;
  username: string | null;
  displayName: string | null;
  usernameKey: string;
};

function cursorValue(cursor: string | undefined): { usernameKey: string; id: string } | undefined {
  if (!cursor) return undefined;
  try {
    const normalized = cursor.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const parsed = JSON.parse(atob(padded)) as { usernameKey?: unknown; id?: unknown };
    if (typeof parsed.usernameKey === "string" && typeof parsed.id === "string" && parsed.id.length > 0) {
      return { usernameKey: parsed.usernameKey, id: parsed.id };
    }
  } catch {
    // Invalid cursor input uses the stable public validation error below.
  }
  throw new RelationshipStoreError("INVALID_CURSOR");
}

function nextCursor(usernameKey: string, id: string): string {
  return btoa(JSON.stringify({ usernameKey, id })).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function userCard(row: FriendRow): RelationshipUserCard {
  return { id: row.id, username: row.username!, displayName: row.displayName!, relationship: "friends" };
}

/** Lists only complete, active reciprocal friendships and no blocked or unavailable accounts. */
export async function listFriendRows(queryable: RelationshipQueryable, actorId: string, limit: number, cursor?: string): Promise<RelationshipUserPage> {
  // The shared transaction interface predates builder reads; callers provide DayliDatabase transactions.
  const database = queryable as unknown as Pick<DayliDatabase, "select">;
  const { friendships, relationshipBlocks, user } = schema;
  const mine = alias(friendships, "mine");
  const reciprocal = alias(friendships, "reciprocal");
  const friend = alias(user, "friend");
  const after = cursorValue(cursor);
  const rows: FriendRow[] = await database
    .select({
      id: friend.id,
      username: friend.username,
      displayName: sql<string>`coalesce(${friend.displayUsername}, ${friend.username})`,
      usernameKey: sql<string>`lower(${friend.username})`,
    })
    .from(mine)
    .innerJoin(reciprocal, and(
      eq(reciprocal.userId, mine.friendId),
      eq(reciprocal.friendId, mine.userId),
      eq(reciprocal.state, "active"),
    ))
    .innerJoin(friend, eq(friend.id, mine.friendId))
    .where(and(
      eq(mine.userId, actorId),
      eq(mine.state, "active"),
      isNotNull(friend.username),
      sql`(coalesce(${friend.banned}, false) = false or (${friend.banExpires} is not null and ${friend.banExpires} <= now()))`,
      notExists(
        database.select({ blockerId: relationshipBlocks.blockerId }).from(relationshipBlocks).where(and(
          isNull(relationshipBlocks.unblockedAt),
          or(
            and(eq(relationshipBlocks.blockerId, actorId), eq(relationshipBlocks.blockedId, friend.id)),
            and(eq(relationshipBlocks.blockerId, friend.id), eq(relationshipBlocks.blockedId, actorId)),
          ),
        )),
      ),
      after ? sql`(lower(${friend.username}), ${friend.id}) > (${after.usernameKey}, ${after.id})` : undefined,
    ))
    .orderBy(asc(sql`lower(${friend.username})`), asc(friend.id))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(userCard);
  const last = rows[Math.min(rows.length, limit) - 1];
  return { items, hasMore, nextCursor: hasMore && last ? nextCursor(last.usernameKey, last.id) : null };
}
