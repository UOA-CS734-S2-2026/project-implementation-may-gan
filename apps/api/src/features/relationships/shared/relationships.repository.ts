import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import {
  createHyperdriveDatabase,
  schema,
  type DayliDatabase,
  type HyperdriveBinding,
} from "@dayli/db";
import { acceptFriendRequestRow } from "./accept-friend-request.repository";
import { blockRelationshipPair } from "./block-user.repository";
import { cancelFriendRequestRow } from "./cancel-friend-request.repository";
import { declineFriendRequestRow } from "./decline-friend-request.repository";
import { listPendingRequestRows } from "./list-friend-requests.repository";
import { listFriendRows } from "./list-friends.repository";
import { consumeUsernameSearchQuota, searchUsernameRows } from "./search-users.repository";
import { endFriendshipRows } from "./remove-friendship.repository";
import { insertFriendRequest } from "./send-friend-request.repository";
import {
  RelationshipStoreError,
  type PendingRequestPage,
  type RelationshipStore,
  type RelationshipTransaction,
  type StoredPendingRequest,
  type StoredRelationshipSnapshot,
} from "./relationship-service";
import { type RelationshipPostgresContext, type RelationshipQueryable } from "./relationship-postgres";
import { unblockRelationshipPair } from "./unblock-user.repository";

type FriendshipSnapshotRow = {
  user_id: string;
  friend_id: string;
  state: "active" | "ended";
  state_changed_at: Date;
};

type RequestSnapshotRow = {
  id: string;
  sender_id: string;
  recipient_id: string;
  created_at: Date;
};

function requestFromRow(row: RequestSnapshotRow): StoredPendingRequest {
  return {
    id: row.id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    createdAt: row.created_at.toISOString(),
  };
}

function stateChangedAt(row: FriendshipSnapshotRow): string {
  return row.state_changed_at.toISOString();
}

function relationshipPairKey(leftUserId: string, rightUserId: string): string {
  return [leftUserId, rightUserId]
    .sort()
    .map((value) => `${value.length}:${value}`)
    .join(":");
}

export class PostgresRelationshipsStore implements RelationshipStore {
  constructor(private readonly database: DayliDatabase) {}

  withTransaction<T>(operation: (transaction: RelationshipTransaction) => Promise<T>): Promise<T> {
    return this.database.transaction(async (transaction) => operation(this.transaction(transaction)));
  }

  private transaction(queryable: RelationshipQueryable): RelationshipTransaction {
    // The shared transaction interface predates builders. Store transactions are DayliDatabase transactions.
    const database = queryable as unknown as DayliDatabase;
    const { friendRequests, friendships, relationshipBlocks, user } = schema;
    const pairCondition = (left: string, right: string) => or(
      and(eq(relationshipBlocks.blockerId, left), eq(relationshipBlocks.blockedId, right)),
      and(eq(relationshipBlocks.blockerId, right), eq(relationshipBlocks.blockedId, left)),
    );
    const relationshipCondition = (left: string, right: string) => or(
      and(eq(friendships.userId, left), eq(friendships.friendId, right)),
      and(eq(friendships.userId, right), eq(friendships.friendId, left)),
    );
    const requestCondition = (left: string, right: string) => or(
      and(eq(friendRequests.senderId, left), eq(friendRequests.recipientId, right)),
      and(eq(friendRequests.senderId, right), eq(friendRequests.recipientId, left)),
    );
    const lockPair = async (left: string, right: string) => {
      const rows = await database
        .select({ lock: sql`pg_advisory_xact_lock(hashtextextended(${relationshipPairKey(left, right)}, 734))` })
        .from(sql`(values (1)) as lock_source`);
      if (rows.length !== 1) throw new Error("Relationship pair lock did not return exactly one row.");
    };
    const targetExists = async (userId: string) => {
      const result = await database.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1);
      return result.length > 0;
    };
    const snapshot = async (actorId: string, subjectId: string): Promise<StoredRelationshipSnapshot> => {
      const [target, blocks, friendshipsRows, requests] = await Promise.all([
        database.select({ id: user.id }).from(user).where(eq(user.id, subjectId)).limit(1),
        database
          .select({ blocker_id: relationshipBlocks.blockerId, blocked_id: relationshipBlocks.blockedId })
          .from(relationshipBlocks)
          .where(and(isNull(relationshipBlocks.unblockedAt), pairCondition(actorId, subjectId))),
        database
          .select({
            user_id: friendships.userId,
            friend_id: friendships.friendId,
            state: friendships.state,
            state_changed_at: friendships.stateChangedAt,
          })
          .from(friendships)
          .where(relationshipCondition(actorId, subjectId)),
        database
          .select({
            id: friendRequests.id,
            sender_id: friendRequests.senderId,
            recipient_id: friendRequests.recipientId,
            created_at: friendRequests.createdAt,
          })
          .from(friendRequests)
          .where(and(eq(friendRequests.status, "pending"), requestCondition(actorId, subjectId)))
          .orderBy(asc(friendRequests.createdAt), asc(friendRequests.id)),
      ]);
      const actorFriendship = friendshipsRows.find((row) => row.user_id === actorId);
      const subjectFriendship = friendshipsRows.find((row) => row.user_id === subjectId);
      const incoming = requests.find((row) => row.sender_id === subjectId);
      const outgoing = requests.find((row) => row.sender_id === actorId);
      return {
        actorId,
        subjectId,
        targetExists: target.length > 0,
        blocks: {
          actorBlocksSubject: blocks.some((row) => row.blocker_id === actorId),
          subjectBlocksActor: blocks.some((row) => row.blocker_id === subjectId),
        },
        friendships: {
          actorToSubject: actorFriendship ? { userId: actorFriendship.user_id, friendId: actorFriendship.friend_id, state: actorFriendship.state, stateChangedAt: stateChangedAt(actorFriendship) } : null,
          subjectToActor: subjectFriendship ? { userId: subjectFriendship.user_id, friendId: subjectFriendship.friend_id, state: subjectFriendship.state, stateChangedAt: stateChangedAt(subjectFriendship) } : null,
        },
        requests: { incoming: incoming ? requestFromRow(incoming) : null, outgoing: outgoing ? requestFromRow(outgoing) : null },
      };
    };
    const requireTarget = async (left: string, right: string) => {
      if (!(await targetExists(right)) || !(await targetExists(left))) throw new RelationshipStoreError("TARGET_NOT_FOUND");
    };
    const activeBlock = async (left: string, right: string) => {
      const result = await database
        .select({ one: sql<number>`1` })
        .from(relationshipBlocks)
        .where(and(isNull(relationshipBlocks.unblockedAt), pairCondition(left, right)))
        .limit(1);
      return result.length > 0;
    };
    const finishRequest: RelationshipPostgresContext["finishRequest"] = async (requestId, actorColumn, actorId, status, at) => {
      const initial = (await database
        .select({ sender_id: friendRequests.senderId, recipient_id: friendRequests.recipientId })
        .from(friendRequests)
        .where(eq(friendRequests.id, requestId))
        .limit(1))[0];
      if (!initial || initial[actorColumn] !== actorId) throw new RelationshipStoreError("REQUEST_NOT_FOUND");
      const other = actorColumn === "recipient_id" ? initial.sender_id : initial.recipient_id;
      await lockPair(actorId, other);
      const request = (await database
        .select({
          id: friendRequests.id,
          sender_id: friendRequests.senderId,
          recipient_id: friendRequests.recipientId,
          status: friendRequests.status,
        })
        .from(friendRequests)
        .where(eq(friendRequests.id, requestId))
        .for("update")
        .limit(1))[0];
      if (!request || request.status !== "pending" || request[actorColumn] !== actorId) throw new RelationshipStoreError("REQUEST_NOT_FOUND");
      if (await activeBlock(actorId, other)) throw new RelationshipStoreError("FORBIDDEN");
      await database
        .update(friendRequests)
        .set({ status, resolvedAt: new Date(at) })
        .where(eq(friendRequests.id, requestId))
        .returning({ id: friendRequests.id });
      return { other, request };
    };
    const context: RelationshipPostgresContext = { queryable, lockPair, requireTarget, activeBlock, snapshot, finishRequest };

    return {
      getSnapshot: snapshot,
      listPendingRequests: (actorId, direction, limit, cursor): Promise<PendingRequestPage> => listPendingRequestRows(queryable, actorId, direction, limit, cursor),
      listFriends: (actorId, limit, cursor) => listFriendRows(queryable, actorId, limit, cursor),
      searchUsers: async (actorId, query, limit, searchedAt, cursor) => {
        await consumeUsernameSearchQuota(queryable, actorId, new Date(searchedAt));
        return searchUsernameRows(queryable, actorId, query, limit, cursor);
      },
      sendRequest: (input) => insertFriendRequest(context, input),
      acceptRequest: (input) => acceptFriendRequestRow(context, input),
      declineRequest: (input) => declineFriendRequestRow(context, input),
      cancelRequest: (input) => cancelFriendRequestRow(context, input),
      removeFriendship: (input) => endFriendshipRows(context, input),
      block: (input) => blockRelationshipPair(context, input),
      unblock: (input) => unblockRelationshipPair(context, input),
    };
  }
}

export function createPostgresRelationshipsStore(database: DayliDatabase): RelationshipStore {
  return new PostgresRelationshipsStore(database);
}

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
