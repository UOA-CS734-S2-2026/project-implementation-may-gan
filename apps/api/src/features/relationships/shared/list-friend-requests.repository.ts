import { RelationshipStoreError, type PendingRequestPage, type PendingRequestDirection, type StoredPendingRequest } from "./relationship-service";
import { relationshipRows, sql, type RelationshipQueryable, type RelationshipRow } from "./relationship-postgres";

function cursorValue(cursor: string | undefined): { createdAt: string; id: string } | undefined {
  if (!cursor) return undefined;
  try {
    const normalized = cursor.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const parsed = JSON.parse(atob(padded)) as { createdAt?: unknown; id?: unknown };
    if (typeof parsed.createdAt === "string" && !Number.isNaN(Date.parse(parsed.createdAt)) && typeof parsed.id === "string" && parsed.id.length > 0) {
      return { createdAt: parsed.createdAt, id: parsed.id };
    }
  } catch {
    // Invalid cursor input uses the stable public validation error below.
  }
  throw new RelationshipStoreError("INVALID_CURSOR");
}

function nextCursor(createdAt: string, id: string): string {
  return btoa(JSON.stringify({ createdAt, id })).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function requestFromRow(row: RelationshipRow, actorId: string): StoredPendingRequest {
  return {
    id: String(row.id),
    senderId: String(row.sender_id),
    recipientId: String(row.recipient_id),
    createdAt: new Date(String(row.created_at)).toISOString(),
    user: {
      id: String(row.user_id),
      username: String(row.username),
      displayName: String(row.display_name),
      relationship: row.sender_id === actorId ? "outgoing_pending" : "incoming_pending",
    },
  };
}

export async function listPendingRequestRows(queryable: RelationshipQueryable, actorId: string, direction: PendingRequestDirection, limit: number, cursor?: string): Promise<PendingRequestPage> {
  const after = cursorValue(cursor);
  const directionSql = direction === "incoming" ? sql`and request.recipient_id = ${actorId}` : direction === "outgoing" ? sql`and request.sender_id = ${actorId}` : sql`and (request.sender_id = ${actorId} or request.recipient_id = ${actorId})`;
  const cursorSql = after ? sql`and (request.created_at, request.id) > (${after.createdAt}::timestamptz, ${after.id})` : sql``;
  const result = relationshipRows<RelationshipRow>(await queryable.execute(sql`
    select request.id, request.sender_id, request.recipient_id, request.created_at,
      to_char(request.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_created_at,
      other.id as user_id, other.username, coalesce(other.display_username, other.username) as display_name
    from public.friend_requests request
    join public."user" other on other.id = case when request.sender_id = ${actorId} then request.recipient_id else request.sender_id end
    where request.status = 'pending' ${directionSql} ${cursorSql}
      and other.username is not null
      and (coalesce(other.banned, false) = false or (other.ban_expires is not null and other.ban_expires <= now()))
      and not exists (
        select 1 from public.relationship_blocks block where block.unblocked_at is null
          and ((block.blocker_id = ${actorId} and block.blocked_id = other.id) or (block.blocker_id = other.id and block.blocked_id = ${actorId}))
      )
    order by request.created_at asc, request.id asc limit ${limit + 1}
  `));
  const hasMore = result.length > limit;
  const items = result.slice(0, limit).map((row) => requestFromRow(row, actorId));
  const last = result[Math.min(result.length, limit) - 1];
  return {
    items,
    hasMore,
    nextCursor: hasMore && last ? nextCursor(String(last.cursor_created_at), String(last.id)) : null,
  };
}
