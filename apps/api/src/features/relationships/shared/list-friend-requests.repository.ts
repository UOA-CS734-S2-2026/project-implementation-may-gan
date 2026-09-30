import { and, asc, eq, isNotNull, isNull, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { schema, type DayliDatabase } from "@dayli/db";
import { RelationshipStoreError, type PendingRequestPage, type PendingRequestDirection, type StoredPendingRequest } from "./relationship-service";
import type { RelationshipQueryable } from "./relationship-postgres";

type PendingRequestRow = {
  id: string;
  senderId: string;
  recipientId: string;
  createdAt: Date;
  cursorCreatedAt: string;
  userId: string;
  username: string | null;
  displayName: string | null;
};

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

function requestFromRow(row: PendingRequestRow, actorId: string): StoredPendingRequest {
  return {
    id: row.id,
    senderId: row.senderId,
    recipientId: row.recipientId,
    createdAt: row.createdAt.toISOString(),
    user: {
      id: row.userId,
      username: row.username!,
      displayName: row.displayName!,
      relationship: row.senderId === actorId ? "outgoing_pending" : "incoming_pending",
    },
  };
}

export async function listPendingRequestRows(queryable: RelationshipQueryable, actorId: string, direction: PendingRequestDirection, limit: number, cursor?: string): Promise<PendingRequestPage> {
  // The shared transaction interface predates builder reads; callers provide DayliDatabase transactions.
  const database = queryable as unknown as Pick<DayliDatabase, "select">;
  const { friendRequests, relationshipBlocks, user } = schema;
  const other = alias(user, "other");
  const after = cursorValue(cursor);
  const directionCondition = direction === "incoming"
    ? eq(friendRequests.recipientId, actorId)
    : direction === "outgoing"
    ? eq(friendRequests.senderId, actorId)
    : or(eq(friendRequests.senderId, actorId), eq(friendRequests.recipientId, actorId));
  const rows: PendingRequestRow[] = await database
    .select({
      id: friendRequests.id,
      senderId: friendRequests.senderId,
      recipientId: friendRequests.recipientId,
      createdAt: friendRequests.createdAt,
      cursorCreatedAt: sql<string>`to_char(${friendRequests.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      userId: other.id,
      username: other.username,
      displayName: sql<string>`coalesce(${other.displayUsername}, ${other.username})`,
    })
    .from(friendRequests)
    .innerJoin(other, eq(other.id, sql<string>`case when ${friendRequests.senderId} = ${actorId} then ${friendRequests.recipientId} else ${friendRequests.senderId} end`))
    .where(and(
      eq(friendRequests.status, "pending"),
      directionCondition,
      after ? sql`(${friendRequests.createdAt}, ${friendRequests.id}) > (${after.createdAt}::timestamptz, ${after.id})` : undefined,
      isNotNull(other.username),
      sql`(coalesce(${other.banned}, false) = false or (${other.banExpires} is not null and ${other.banExpires} <= now()))`,
      notExists(database.select({ one: sql`1` }).from(schema.accountLifecycles).where(and(
        eq(schema.accountLifecycles.userId, other.id),
        eq(schema.accountLifecycles.state, "pending_deletion"),
      ))),
      notExists(
        database.select({ one: sql`1` }).from(relationshipBlocks).where(and(
          isNull(relationshipBlocks.unblockedAt),
          or(
            and(eq(relationshipBlocks.blockerId, actorId), eq(relationshipBlocks.blockedId, other.id)),
            and(eq(relationshipBlocks.blockerId, other.id), eq(relationshipBlocks.blockedId, actorId)),
          ),
        )),
      ),
    ))
    .orderBy(asc(friendRequests.createdAt), asc(friendRequests.id))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map((row) => requestFromRow(row, actorId));
  const last = rows[Math.min(rows.length, limit) - 1];
  return {
    items,
    hasMore,
    nextCursor: hasMore && last ? nextCursor(last.cursorCreatedAt, last.id) : null,
  };
}
