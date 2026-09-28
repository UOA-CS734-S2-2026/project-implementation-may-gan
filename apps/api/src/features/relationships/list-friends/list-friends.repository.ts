import type { RelationshipUserCard, RelationshipUserPage } from "../shared/relationship-service";
import { RelationshipStoreError } from "../shared/relationship-service";
import { relationshipRows, sql, type RelationshipQueryable } from "../shared/relationship-postgres";

type FriendRow = {
  id: string;
  username: string;
  display_name: string;
  username_key: string;
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
  return { id: String(row.id), username: String(row.username), displayName: String(row.display_name), relationship: "friends" };
}

/** Lists only complete, active reciprocal friendships and no blocked or unavailable accounts. */
export async function listFriendRows(queryable: RelationshipQueryable, actorId: string, limit: number, cursor?: string): Promise<RelationshipUserPage> {
  const after = cursorValue(cursor);
  const cursorSql = after ? sql`and (lower(friend.username), friend.id) > (${after.usernameKey}, ${after.id})` : sql``;
  const rows = relationshipRows<FriendRow>(await queryable.execute(sql`
    select friend.id, friend.username, coalesce(friend.display_username, friend.name) as display_name, lower(friend.username) as username_key
    from public.friendships mine
    join public.friendships reciprocal on reciprocal.user_id = mine.friend_id and reciprocal.friend_id = mine.user_id and reciprocal.state = 'active'
    join public."user" friend on friend.id = mine.friend_id
    where mine.user_id = ${actorId} and mine.state = 'active'
      and friend.username is not null
      and (coalesce(friend.banned, false) = false or (friend.ban_expires is not null and friend.ban_expires <= now()))
      and not exists (
        select 1 from public.relationship_blocks block
        where block.unblocked_at is null
          and ((block.blocker_id = ${actorId} and block.blocked_id = friend.id) or (block.blocker_id = friend.id and block.blocked_id = ${actorId}))
      )
      ${cursorSql}
    order by lower(friend.username) asc, friend.id asc
    limit ${limit + 1}
  `));
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(userCard);
  const last = rows[Math.min(rows.length, limit) - 1];
  return { items, hasMore, nextCursor: hasMore && last ? nextCursor(String(last.username_key), String(last.id)) : null };
}
