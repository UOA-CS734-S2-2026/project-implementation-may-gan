import {
  createHyperdriveDatabase,
  lockRelationshipPair,
  sql,
  type DayliDatabase,
  type HyperdriveBinding,
} from "@dayli/db";
import { acceptFriendRequestRow } from "./accept-friend-request/accept-friend-request.repository";
import { blockRelationshipPair } from "./block-user/block-user.repository";
import { cancelFriendRequestRow } from "./cancel-friend-request/cancel-friend-request.repository";
import { declineFriendRequestRow } from "./decline-friend-request/decline-friend-request.repository";
import { listPendingRequestRows } from "./list-friend-requests/list-friend-requests.repository";
import { endFriendshipRows } from "./remove-friendship/remove-friendship.repository";
import { insertFriendRequest } from "./send-friend-request/send-friend-request.repository";
import {
  RelationshipStoreError,
  type PendingRequestPage,
  type RelationshipStore,
  type RelationshipTransaction,
  type StoredPendingRequest,
  type StoredRelationshipSnapshot,
} from "./shared/relationship-service";
import { relationshipRows, type RelationshipPostgresContext, type RelationshipQueryable, type RelationshipRow } from "./shared/relationship-postgres";
import { unblockRelationshipPair } from "./unblock-user/unblock-user.repository";

function requestFromRow(row: RelationshipRow): StoredPendingRequest {
  return {
    id: String(row.id),
    senderId: String(row.sender_id),
    recipientId: String(row.recipient_id),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function stateChangedAt(row: RelationshipRow): string {
  return new Date(String(row.state_changed_at)).toISOString();
}

export class PostgresRelationshipsStore implements RelationshipStore {
  constructor(private readonly database: DayliDatabase) {}

  withTransaction<T>(operation: (transaction: RelationshipTransaction) => Promise<T>): Promise<T> {
    return this.database.transaction(async (transaction) => operation(this.transaction(transaction)));
  }

  private transaction(queryable: RelationshipQueryable): RelationshipTransaction {
    const lockPair = (left: string, right: string) => lockRelationshipPair(queryable, left, right);
    const targetExists = async (userId: string) => {
      const result = relationshipRows<{ id: string }>(await queryable.execute(sql`select id from public."user" where id = ${userId}`));
      return result.length > 0;
    };
    const snapshot = async (actorId: string, subjectId: string): Promise<StoredRelationshipSnapshot> => {
      const [target, blockRows, friendshipRows, requestRows] = await Promise.all([
        queryable.execute(sql`select id from public."user" where id = ${subjectId}`),
        queryable.execute(sql`select blocker_id, blocked_id from public.relationship_blocks where unblocked_at is null and ((blocker_id = ${actorId} and blocked_id = ${subjectId}) or (blocker_id = ${subjectId} and blocked_id = ${actorId}))`),
        queryable.execute(sql`select user_id, friend_id, state, state_changed_at from public.friendships where (user_id = ${actorId} and friend_id = ${subjectId}) or (user_id = ${subjectId} and friend_id = ${actorId})`),
        queryable.execute(sql`select id, sender_id, recipient_id, created_at from public.friend_requests where status = 'pending' and ((sender_id = ${actorId} and recipient_id = ${subjectId}) or (sender_id = ${subjectId} and recipient_id = ${actorId})) order by created_at asc, id asc`),
      ]);
      const blocks = relationshipRows(blockRows);
      const friendships = relationshipRows<RelationshipRow>(friendshipRows);
      const requests = relationshipRows<RelationshipRow>(requestRows);
      const actorFriendship = friendships.find((row) => row.user_id === actorId);
      const subjectFriendship = friendships.find((row) => row.user_id === subjectId);
      const incoming = requests.find((row) => row.sender_id === subjectId);
      const outgoing = requests.find((row) => row.sender_id === actorId);
      return {
        actorId,
        subjectId,
        targetExists: relationshipRows(target).length > 0,
        blocks: {
          actorBlocksSubject: blocks.some((row) => row.blocker_id === actorId),
          subjectBlocksActor: blocks.some((row) => row.blocker_id === subjectId),
        },
        friendships: {
          actorToSubject: actorFriendship ? { userId: String(actorFriendship.user_id), friendId: String(actorFriendship.friend_id), state: actorFriendship.state as "active" | "ended", stateChangedAt: stateChangedAt(actorFriendship) } : null,
          subjectToActor: subjectFriendship ? { userId: String(subjectFriendship.user_id), friendId: String(subjectFriendship.friend_id), state: subjectFriendship.state as "active" | "ended", stateChangedAt: stateChangedAt(subjectFriendship) } : null,
        },
        requests: { incoming: incoming ? requestFromRow(incoming) : null, outgoing: outgoing ? requestFromRow(outgoing) : null },
      };
    };
    const requireTarget = async (left: string, right: string) => {
      if (!(await targetExists(right)) || !(await targetExists(left))) throw new RelationshipStoreError("TARGET_NOT_FOUND");
    };
    const activeBlock = async (left: string, right: string) => {
      const result = await queryable.execute(sql`select 1 from public.relationship_blocks where unblocked_at is null and ((blocker_id = ${left} and blocked_id = ${right}) or (blocker_id = ${right} and blocked_id = ${left})) limit 1`);
      return relationshipRows(result).length > 0;
    };
    const finishRequest: RelationshipPostgresContext["finishRequest"] = async (requestId, actorColumn, actorId, status, at) => {
      const initial = relationshipRows<RelationshipRow>(await queryable.execute(sql`select sender_id, recipient_id from public.friend_requests where id = ${requestId}`))[0];
      if (!initial || initial[actorColumn] !== actorId) throw new RelationshipStoreError("REQUEST_NOT_FOUND");
      const other = String(actorColumn === "recipient_id" ? initial.sender_id : initial.recipient_id);
      await lockPair(actorId, other);
      const request = relationshipRows<RelationshipRow>(await queryable.execute(sql`select id, sender_id, recipient_id, status from public.friend_requests where id = ${requestId} for update`))[0];
      if (!request || request.status !== "pending" || request[actorColumn] !== actorId) throw new RelationshipStoreError("REQUEST_NOT_FOUND");
      if (await activeBlock(actorId, other)) throw new RelationshipStoreError("FORBIDDEN");
      await queryable.execute(sql`update public.friend_requests set status = ${status}, resolved_at = ${at} where id = ${requestId}`);
      return { other, request };
    };
    const context: RelationshipPostgresContext = { queryable, lockPair, requireTarget, activeBlock, snapshot, finishRequest };

    return {
      getSnapshot: snapshot,
      listPendingRequests: (actorId, direction, limit, cursor): Promise<PendingRequestPage> => listPendingRequestRows(queryable, actorId, direction, limit, cursor),
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
