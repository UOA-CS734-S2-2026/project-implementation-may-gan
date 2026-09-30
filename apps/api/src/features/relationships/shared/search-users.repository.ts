import { and, asc, eq, exists, isNotNull, isNull, ne, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { schema, type DayliDatabase } from "@dayli/db";
import { RelationshipStoreError, type RelationshipUserCard, type RelationshipUserPage } from "./relationship-service";
import { type RelationshipQueryable } from "./relationship-postgres";

type SearchRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  username_key: string;
  relationship: RelationshipUserCard["relationship"];
};

const searchWindowMilliseconds = 60_000;
const maxSearchesPerWindow = 30;

type SearchDatabase = Pick<DayliDatabase, "insert" | "update">;

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
  await queryable
    .select({ lock: sql`pg_advisory_xact_lock(hashtextextended(${"relationship-search:" + actorId}, 734))` })
    .from(sql`(values (1)) as lock_source`);
  // Callers provide DayliDatabase transactions for quota writes.
  const database = queryable as unknown as SearchDatabase;
  const [existing] = await queryable
    .select({
      window_started_at: schema.relationshipSearchQuota.windowStartedAt,
      request_count: schema.relationshipSearchQuota.requestCount,
    })
    .from(schema.relationshipSearchQuota)
    .where(eq(schema.relationshipSearchQuota.actorId, actorId))
    .for("update");
  if (!existing) {
    await database.insert(schema.relationshipSearchQuota).values({
      actorId,
      windowStartedAt: now,
      requestCount: 1,
    });
    return;
  }
  const startedAt = new Date(existing.window_started_at).getTime();
  const elapsed = now.getTime() - startedAt;
  if (elapsed >= searchWindowMilliseconds) {
    await database
      .update(schema.relationshipSearchQuota)
      .set({ windowStartedAt: now, requestCount: 1 })
      .where(eq(schema.relationshipSearchQuota.actorId, actorId));
    return;
  }
  const count = Number(existing.request_count);
  if (count >= maxSearchesPerWindow) {
    throw new RelationshipStoreError("THROTTLED", { retryAfterSeconds: Math.max(1, Math.ceil((searchWindowMilliseconds - elapsed) / 1000)) });
  }
  await database
    .update(schema.relationshipSearchQuota)
    .set({ requestCount: count + 1 })
    .where(eq(schema.relationshipSearchQuota.actorId, actorId));
}

/** Private profiles are discoverable here only as a minimal username/display-name card. */
export async function searchUsernameRows(queryable: RelationshipQueryable, actorId: string, query: string, limit: number, cursor?: string): Promise<RelationshipUserPage> {
  const { friendRequests, friendships, relationshipBlocks, user } = schema;
  const mine = alias(friendships, "mine");
  const reciprocal = alias(friendships, "reciprocal");
  const candidate = alias(user, "candidate");
  const after = cursorValue(cursor);
  const prefix = literalUsernamePrefix(query);
  const relationship = sql<RelationshipUserCard["relationship"]>`
    case
      when ${exists(
        queryable
          .select({ userId: mine.userId })
          .from(mine)
          .innerJoin(reciprocal, and(
            eq(reciprocal.userId, mine.friendId),
            eq(reciprocal.friendId, mine.userId),
            eq(reciprocal.state, "active"),
          ))
          .where(and(
            eq(mine.userId, actorId),
            eq(mine.friendId, candidate.id),
            eq(mine.state, "active"),
          )),
      )} then 'friends'
      when ${exists(
        queryable.select({ id: friendRequests.id }).from(friendRequests).where(and(
          eq(friendRequests.status, "pending"),
          eq(friendRequests.senderId, actorId),
          eq(friendRequests.recipientId, candidate.id),
        )),
      )} then 'outgoing_pending'
      when ${exists(
        queryable.select({ id: friendRequests.id }).from(friendRequests).where(and(
          eq(friendRequests.status, "pending"),
          eq(friendRequests.senderId, candidate.id),
          eq(friendRequests.recipientId, actorId),
        )),
      )} then 'incoming_pending'
      else 'none'
    end
  `;
  const rows: SearchRow[] = await queryable
    .select({
      id: candidate.id,
      username: candidate.username,
      display_name: sql<string>`coalesce(${candidate.displayUsername}, ${candidate.username})`,
      username_key: sql<string>`lower(${candidate.username})`,
      relationship,
    })
    .from(candidate)
    .where(and(
      ne(candidate.id, actorId),
      isNotNull(candidate.username),
      sql`lower(${candidate.username}) like lower(${prefix}) || '%' escape E'\\\\'`,
      sql`(coalesce(${candidate.banned}, false) = false or (${candidate.banExpires} is not null and ${candidate.banExpires} <= now()))`,
      notExists(queryable.select({ one: sql`1` }).from(schema.accountLifecycles).where(and(
        eq(schema.accountLifecycles.userId, candidate.id),
        eq(schema.accountLifecycles.state, "pending_deletion"),
      ))),
      notExists(
        queryable.select({ blockerId: relationshipBlocks.blockerId }).from(relationshipBlocks).where(and(
          isNull(relationshipBlocks.unblockedAt),
          or(
            and(eq(relationshipBlocks.blockerId, actorId), eq(relationshipBlocks.blockedId, candidate.id)),
            and(eq(relationshipBlocks.blockerId, candidate.id), eq(relationshipBlocks.blockedId, actorId)),
          ),
        )),
      ),
      after ? sql`(lower(${candidate.username}), ${candidate.id}) > (${after.usernameKey}, ${after.id})` : undefined,
    ))
    .orderBy(asc(sql`lower(${candidate.username})`), asc(candidate.id))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(card);
  const last = rows[Math.min(rows.length, limit) - 1];
  return { items, hasMore, nextCursor: hasMore && last ? nextCursor(String(last.username_key), String(last.id)) : null };
}
