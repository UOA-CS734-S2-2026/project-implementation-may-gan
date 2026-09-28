import { RelationshipStoreError, type PendingRequestPage, type PendingRequestDirection, type StoredPendingRequest } from "../shared/relationship-service";
import { relationshipRows, sql, type RelationshipQueryable, type RelationshipRow } from "../shared/relationship-postgres";

function cursorValue(cursor: string | undefined): { createdAt: string; id: string } | undefined {
  if (!cursor) return undefined;
  try {
    const normalized = cursor.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const parsed = JSON.parse(atob(padded)) as { createdAt?: unknown; id?: unknown };
    if (typeof parsed.createdAt === "string" && !Number.isNaN(Date.parse(parsed.createdAt)) && typeof parsed.id === "string" && parsed.id.length > 0) {
      return parsed as { createdAt: string; id: string };
    }
  } catch {
    // Invalid cursor input uses the stable public validation error below.
  }
  throw new RelationshipStoreError("INVALID_CURSOR");
}

function nextCursor(createdAt: string, id: string): string {
  return btoa(JSON.stringify({ createdAt, id })).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function requestFromRow(row: RelationshipRow): StoredPendingRequest {
  return { id: String(row.id), senderId: String(row.sender_id), recipientId: String(row.recipient_id), createdAt: new Date(String(row.created_at)).toISOString() };
}

export async function listPendingRequestRows(queryable: RelationshipQueryable, actorId: string, direction: PendingRequestDirection, limit: number, cursor?: string): Promise<PendingRequestPage> {
  const after = cursorValue(cursor);
  const directionSql = direction === "incoming" ? sql`and recipient_id = ${actorId}` : direction === "outgoing" ? sql`and sender_id = ${actorId}` : sql`and (sender_id = ${actorId} or recipient_id = ${actorId})`;
  const cursorSql = after ? sql`and (created_at, id) > (${after.createdAt}::timestamptz, ${after.id})` : sql``;
  const result = relationshipRows<RelationshipRow>(await queryable.execute(sql`
    select id, sender_id, recipient_id, created_at from public.friend_requests
    where status = 'pending' ${directionSql} ${cursorSql}
    order by created_at asc, id asc limit ${limit + 1}
  `));
  const hasMore = result.length > limit;
  const items = result.slice(0, limit).map(requestFromRow);
  const last = items.at(-1);
  return { items, hasMore, nextCursor: hasMore && last ? nextCursor(last.createdAt, last.id) : null };
}
