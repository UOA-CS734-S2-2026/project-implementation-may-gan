import { RelationshipStoreError, type RelationshipUserCard, type RelationshipUserPage } from "../shared/relationship-service";
import { relationshipRows, sql, type RelationshipQueryable } from "../shared/relationship-postgres";

type SearchRow = {
  id: string;
  username: string;
  display_name: string;
  username_key: string;
  relationship: RelationshipUserCard["relationship"];
};

const searchWindowMilliseconds = 60_000;
const maxSearchesPerWindow = 30;

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

/** Escape the three PostgreSQL LIKE metacharacters before adding our trailing prefix wildcard. */
function literalUsernamePrefix(query: string): string {
  return query.replace(/[\\%_]/g, "\\$&");
}

function card(row: SearchRow): RelationshipUserCard {
  return {
    id: String(row.id),
    username: String(row.username),
    displayName: String(row.display_name),
    relationship: row.relationship,
  };
}

/**
 * Locks an actor-owned quota row before incrementing it, so Worker isolates
 * cannot evade discovery limits with concurrent requests.
 */
export async function consumeUsernameSearchQuota(queryable: RelationshipQueryable, actorId: string, now: Date): Promise<void> {
  await queryable.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"relationship-search:" + actorId}, 734))`);
  const existing = relationshipRows<{ window_started_at: string; request_count: number | string }>(await queryable.execute(sql`
    select window_started_at, request_count from public.relationship_search_quota where actor_id = ${actorId} for update
  `))[0];
  if (!existing) {
    await queryable.execute(sql`
      insert into public.relationship_search_quota (actor_id, window_started_at, request_count)
      values (${actorId}, ${now.toISOString()}::timestamptz, 1)
    `);
    return;
  }
  const startedAt = new Date(String(existing.window_started_at)).getTime();
  const elapsed = now.getTime() - startedAt;
  if (elapsed >= searchWindowMilliseconds) {
    await queryable.execute(sql`update public.relationship_search_quota set window_started_at = ${now.toISOString()}::timestamptz, request_count = 1 where actor_id = ${actorId}`);
    return;
  }
  const count = Number(existing.request_count);
  if (count >= maxSearchesPerWindow) {
    throw new RelationshipStoreError("THROTTLED", { retryAfterSeconds: Math.max(1, Math.ceil((searchWindowMilliseconds - elapsed) / 1000)) });
  }
  await queryable.execute(sql`update public.relationship_search_quota set request_count = ${count + 1} where actor_id = ${actorId}`);
}

/** Private profiles are discoverable here only as a minimal username/display-name card. */
export async function searchUsernameRows(queryable: RelationshipQueryable, actorId: string, query: string, limit: number, cursor?: string): Promise<RelationshipUserPage> {
  const after = cursorValue(cursor);
  const prefix = literalUsernamePrefix(query);
  const cursorSql = after ? sql`and (lower(candidate.username), candidate.id) > (${after.usernameKey}, ${after.id})` : sql``;
  const rows = relationshipRows<SearchRow>(await queryable.execute(sql`
    select candidate.id, candidate.username, coalesce(candidate.display_username, candidate.name) as display_name,
      lower(candidate.username) as username_key,
      case
        when exists (select 1 from public.friendships mine join public.friendships reciprocal on reciprocal.user_id = mine.friend_id and reciprocal.friend_id = mine.user_id and reciprocal.state = 'active' where mine.user_id = ${actorId} and mine.friend_id = candidate.id and mine.state = 'active') then 'friends'
        when exists (select 1 from public.friend_requests request where request.status = 'pending' and request.sender_id = ${actorId} and request.recipient_id = candidate.id) then 'outgoing_pending'
        when exists (select 1 from public.friend_requests request where request.status = 'pending' and request.sender_id = candidate.id and request.recipient_id = ${actorId}) then 'incoming_pending'
        else 'none'
      end as relationship
    from public."user" candidate
    where candidate.id <> ${actorId}
      and candidate.username is not null
      and lower(candidate.username) like lower(${prefix}) || '%' escape E'\\\\'
      and (coalesce(candidate.banned, false) = false or (candidate.ban_expires is not null and candidate.ban_expires <= now()))
      and not exists (
        select 1 from public.relationship_blocks block
        where block.unblocked_at is null
          and ((block.blocker_id = ${actorId} and block.blocked_id = candidate.id) or (block.blocker_id = candidate.id and block.blocked_id = ${actorId}))
      )
      ${cursorSql}
    order by lower(candidate.username) asc, candidate.id asc
    limit ${limit + 1}
  `));
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(card);
  const last = rows[Math.min(rows.length, limit) - 1];
  return { items, hasMore, nextCursor: hasMore && last ? nextCursor(String(last.username_key), String(last.id)) : null };
}
