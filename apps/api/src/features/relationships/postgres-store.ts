import { createHyperdriveDatabase, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import {
  RelationshipStoreError,
  type PendingRequestDirection,
  type PendingRequestPage,
  type RelationshipStore,
  type RelationshipTransaction,
  type StoredPendingRequest,
  type StoredRelationshipSnapshot,
} from "./service";

type Queryable = Pick<DayliDatabase, "execute">;
type Row = Record<string, unknown>;

function rows<T extends Row>(value: unknown): T[] {
  return [...(value as Iterable<T>)];
}

function pairKey(left: string, right: string): string {
  return [left, right].sort().join("\u0000");
}

function cursorValue(cursor: string | undefined): { createdAt: string; id: string } | undefined {
  if (!cursor) return undefined;
  try {
    const parsed = JSON.parse(atob(cursor.replaceAll("-", "+").replaceAll("_", "/"))) as { createdAt?: unknown; id?: unknown };
    if (typeof parsed.createdAt === "string" && typeof parsed.id === "string") return parsed as { createdAt: string; id: string };
  } catch { /* Invalid cursors are treated as the first page. */ }
  return undefined;
}

function nextCursor(createdAt: string, id: string): string {
  return btoa(JSON.stringify({ createdAt, id })).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function requestFromRow(row: Row): StoredPendingRequest {
  return {
    id: String(row.id),
    senderId: String(row.sender_id),
    recipientId: String(row.recipient_id),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function stateChangedAt(row: Row): string {
  return new Date(String(row.state_changed_at)).toISOString();
}

export class PostgresRelationshipsStore implements RelationshipStore {
  constructor(private readonly database: DayliDatabase) {}

  withTransaction<T>(operation: (transaction: RelationshipTransaction) => Promise<T>): Promise<T> {
    return this.database.transaction(async (tx) => operation(this.transaction(tx)));
  }

  private transaction(queryable: Queryable): RelationshipTransaction {
    const lockPair = async (left: string, right: string) => {
      await queryable.execute(sql`select pg_advisory_xact_lock(hashtextextended(${pairKey(left, right)}, 734))`);
    };

    const targetExists = async (userId: string) => {
      const result = rows<{ id: string }>(await queryable.execute(sql`select id from public."user" where id = ${userId}`));
      return result.length > 0;
    };

    const snapshot = async (actorId: string, subjectId: string): Promise<StoredRelationshipSnapshot> => {
      const [target, blockRows, friendshipRows, requestRows] = await Promise.all([
        queryable.execute(sql`select id from public."user" where id = ${subjectId}`),
        queryable.execute(sql`
          select blocker_id, blocked_id from public.relationship_blocks
          where unblocked_at is null and ((blocker_id = ${actorId} and blocked_id = ${subjectId})
             or (blocker_id = ${subjectId} and blocked_id = ${actorId}))
        `),
        queryable.execute(sql`
          select user_id, friend_id, state, state_changed_at
          from public.friendships
          where (user_id = ${actorId} and friend_id = ${subjectId})
             or (user_id = ${subjectId} and friend_id = ${actorId})
        `),
        queryable.execute(sql`
          select id, sender_id, recipient_id, created_at
          from public.friend_requests
          where status = 'pending' and ((sender_id = ${actorId} and recipient_id = ${subjectId})
             or (sender_id = ${subjectId} and recipient_id = ${actorId}))
          order by created_at asc, id asc
        `),
      ]);
      const blocks = rows(blockRows);
      const friendships = rows(friendshipRows);
      const requests = rows(requestRows);
      const actorFriendship = friendships.find((row) => row.user_id === actorId);
      const subjectFriendship = friendships.find((row) => row.user_id === subjectId);
      const incoming = requests.find((row) => row.sender_id === subjectId);
      const outgoing = requests.find((row) => row.sender_id === actorId);
      return {
        actorId,
        subjectId,
        targetExists: rows(target).length > 0,
        blocks: {
          actorBlocksSubject: blocks.some((row) => row.blocker_id === actorId),
          subjectBlocksActor: blocks.some((row) => row.blocker_id === subjectId),
        },
        friendships: {
          actorToSubject: actorFriendship ? {
            userId: String(actorFriendship.user_id), friendId: String(actorFriendship.friend_id),
            state: actorFriendship.state as "active" | "ended", stateChangedAt: stateChangedAt(actorFriendship),
          } : null,
          subjectToActor: subjectFriendship ? {
            userId: String(subjectFriendship.user_id), friendId: String(subjectFriendship.friend_id),
            state: subjectFriendship.state as "active" | "ended", stateChangedAt: stateChangedAt(subjectFriendship),
          } : null,
        },
        requests: {
          incoming: incoming ? requestFromRow(incoming) : null,
          outgoing: outgoing ? requestFromRow(outgoing) : null,
        },
      };
    };

    const requireTarget = async (left: string, right: string) => {
      if (!(await targetExists(right))) throw new RelationshipStoreError("TARGET_NOT_FOUND");
      if (!(await targetExists(left))) throw new RelationshipStoreError("TARGET_NOT_FOUND");
    };

    const activeBlock = async (left: string, right: string) => {
      const result = await queryable.execute(sql`
        select 1 from public.relationship_blocks
        where unblocked_at is null and ((blocker_id = ${left} and blocked_id = ${right})
           or (blocker_id = ${right} and blocked_id = ${left})) limit 1
      `);
      return rows(result).length > 0;
    };

    const finishRequest = async (requestId: string, actorColumn: "recipient_id" | "sender_id", actorId: string, status: "accepted" | "declined" | "cancelled", at: string) => {
      const initialRows = rows<Row>(await queryable.execute(sql`
        select sender_id, recipient_id from public.friend_requests where id = ${requestId}
      `));
      const initial = initialRows[0];
      if (!initial || initial[actorColumn] !== actorId) throw new RelationshipStoreError("REQUEST_NOT_FOUND");
      const other = String(actorColumn === "recipient_id" ? initial.sender_id : initial.recipient_id);
      await lockPair(actorId, other);
      const requestRows = rows<Row>(await queryable.execute(sql`
        select id, sender_id, recipient_id, status from public.friend_requests where id = ${requestId} for update
      `));
      const request = requestRows[0];
      if (!request || request.status !== "pending" || request[actorColumn] !== actorId) throw new RelationshipStoreError("REQUEST_NOT_FOUND");
      if (await activeBlock(actorId, other)) throw new RelationshipStoreError("FORBIDDEN");
      await queryable.execute(sql`update public.friend_requests set status = ${status}, resolved_at = ${at} where id = ${requestId}`);
      return { other, request };
    };

    return {
      getSnapshot: snapshot,

      async listPendingRequests(actorId, direction, limit, cursor): Promise<PendingRequestPage> {
        const after = cursorValue(cursor);
        const directionSql = direction === "incoming"
          ? sql`and recipient_id = ${actorId}`
          : direction === "outgoing"
            ? sql`and sender_id = ${actorId}`
            : sql`and (sender_id = ${actorId} or recipient_id = ${actorId})`;
        const cursorSql = after ? sql`and (created_at, id) > (${after.createdAt}::timestamptz, ${after.id})` : sql``;
        const result = rows<Row>(await queryable.execute(sql`
          select id, sender_id, recipient_id, created_at
          from public.friend_requests
          where status = 'pending' ${directionSql} ${cursorSql}
          order by created_at asc, id asc limit ${limit + 1}
        `));
        const hasMore = result.length > limit;
        const items = result.slice(0, limit).map(requestFromRow);
        const last = items.at(-1);
        return { items, hasMore, nextCursor: hasMore && last ? nextCursor(last.createdAt, last.id) : null };
      },

      async sendRequest({ senderId, recipientId, createdAt }) {
        await lockPair(senderId, recipientId);
        await requireTarget(senderId, recipientId);
        if (await activeBlock(senderId, recipientId)) throw new RelationshipStoreError("BLOCKED");
        const current = await snapshot(senderId, recipientId);
        if (current.friendships.actorToSubject?.state === "active" && current.friendships.subjectToActor?.state === "active") throw new RelationshipStoreError("ALREADY_FRIENDS");
        if (current.requests.incoming || current.requests.outgoing) throw new RelationshipStoreError("REQUEST_EXISTS");
        const countRows = rows<{ count: number | string; oldest: string | null }>(await queryable.execute(sql`
          select count(*)::int as count, min(created_at) as oldest
          from public.friend_requests
          where sender_id = ${senderId} and created_at >= ${createdAt}::timestamptz - interval '24 hours'
        `));
        const count = Number(countRows[0]?.count ?? 0);
        if (count >= 5) {
          const oldest = countRows[0]?.oldest ? new Date(String(countRows[0].oldest)).getTime() : Date.now();
          throw new RelationshipStoreError("THROTTLED", { retryAfterSeconds: Math.max(1, Math.ceil((oldest + 86_400_000 - new Date(createdAt).getTime()) / 1000)) });
        }
        try {
          await queryable.execute(sql`
            insert into public.friend_requests (id, sender_id, recipient_id, status, created_at)
            values (${crypto.randomUUID()}, ${senderId}, ${recipientId}, 'pending', ${createdAt}::timestamptz)
          `);
        } catch (error) {
          if ((error as { code?: string }).code === "23505") throw new RelationshipStoreError("REQUEST_EXISTS");
          throw error;
        }
        return snapshot(senderId, recipientId);
      },

      async acceptRequest({ requestId, recipientId, acceptedAt }) {
        const { other } = await finishRequest(requestId, "recipient_id", recipientId, "accepted", acceptedAt);
        await queryable.execute(sql`
          insert into public.friendships (user_id, friend_id, state, state_changed_at)
          values (${recipientId}, ${other}, 'active', ${acceptedAt}::timestamptz), (${other}, ${recipientId}, 'active', ${acceptedAt}::timestamptz)
          on conflict (user_id, friend_id) do update set state = 'active', state_changed_at = excluded.state_changed_at
        `);
        return snapshot(recipientId, other);
      },

      async declineRequest({ requestId, recipientId, declinedAt }) {
        const { other } = await finishRequest(requestId, "recipient_id", recipientId, "declined", declinedAt);
        return snapshot(recipientId, other);
      },

      async cancelRequest({ requestId, senderId, cancelledAt }) {
        const { other } = await finishRequest(requestId, "sender_id", senderId, "cancelled", cancelledAt);
        return snapshot(senderId, other);
      },

      async removeFriendship({ actorId, subjectId, endedAt }) {
        await lockPair(actorId, subjectId);
        await requireTarget(actorId, subjectId);
        await queryable.execute(sql`update public.friendships set state = 'ended', state_changed_at = ${endedAt}::timestamptz where (user_id = ${actorId} and friend_id = ${subjectId}) or (user_id = ${subjectId} and friend_id = ${actorId})`);
        return snapshot(actorId, subjectId);
      },

      async block({ blockerId, blockedId, blockedAt }) {
        await lockPair(blockerId, blockedId);
        await requireTarget(blockerId, blockedId);
        await queryable.execute(sql`update public.friend_requests set status = 'cancelled', resolved_at = ${blockedAt}::timestamptz where status = 'pending' and ((sender_id = ${blockerId} and recipient_id = ${blockedId}) or (sender_id = ${blockedId} and recipient_id = ${blockerId}))`);
        await queryable.execute(sql`update public.friendships set state = 'ended', state_changed_at = ${blockedAt}::timestamptz where (user_id = ${blockerId} and friend_id = ${blockedId}) or (user_id = ${blockedId} and friend_id = ${blockerId})`);
        await queryable.execute(sql`
          insert into public.relationship_blocks (blocker_id, blocked_id, blocked_at, unblocked_at)
          values (${blockerId}, ${blockedId}, ${blockedAt}::timestamptz, null)
          on conflict (blocker_id, blocked_id) do update set blocked_at = excluded.blocked_at, unblocked_at = null
        `);
        return snapshot(blockerId, blockedId);
      },

      async unblock({ actorId, subjectId, unblockedAt }) {
        await lockPair(actorId, subjectId);
        await requireTarget(actorId, subjectId);
        await queryable.execute(sql`update public.relationship_blocks set unblocked_at = ${unblockedAt}::timestamptz where blocker_id = ${actorId} and blocked_id = ${subjectId} and unblocked_at is null`);
        return snapshot(actorId, subjectId);
      },
    };
  }
}

export function createPostgresRelationshipsStore(database: DayliDatabase): RelationshipStore {
  return new PostgresRelationshipsStore(database);
}

/** Workers must close the request-scoped Hyperdrive client after each mutation/read. */
export function createHyperdriveRelationshipsStore(hyperdrive: HyperdriveBinding): RelationshipStore {
  return {
    async withTransaction<T>(operation: (transaction: RelationshipTransaction) => Promise<T>) {
      const database = createHyperdriveDatabase(hyperdrive);
      try {
        return await new PostgresRelationshipsStore(database.db).withTransaction(operation);
      } finally {
        await database.close();
      }
    },
  };
}
