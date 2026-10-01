import { createHyperdriveDatabase, schema, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { and, count, desc, eq, gt, inArray, isNull, ne } from "drizzle-orm";
import { appendConversationChange } from "../../shared/append-conversation-change";
import { projectConversationDto } from "../../shared/conversation-projection";
import { messageProjectionSelection } from "../../shared/message-projection";
import { MessagingError } from "../../shared/messaging-error";
import { requireConversationMember } from "../../shared/require-conversation-member";
import { requireSafeSequenceBigInt } from "../../shared/safe-sequence";

export interface ResolveMessageRequestRepository {
  resolve(
    actorId: string,
    conversationId: string,
    decision: "accept" | "decline",
  ): Promise<unknown>;
}

function relationshipPairKey(leftUserId: string, rightUserId: string): string {
  return [leftUserId, rightUserId]
    .sort()
    .map((value) => `${value.length}:${value}`)
    .join(":");
}

async function lockRelationshipPair(
  database: Pick<DayliDatabase, "select">,
  leftUserId: string,
  rightUserId: string,
): Promise<void> {
  const locks = await database
    .select({ lock: sql`pg_advisory_xact_lock(hashtextextended(${relationshipPairKey(leftUserId, rightUserId)}, 734))` })
    .from(sql`(values (1)) as lock_source`);
  if (locks.length !== 1) throw new Error("Relationship pair lock did not return exactly one row.");
}

/**
 * The lifecycle procedure will take these same user rows before changing
 * availability. Lock them canonically before the pair and conversation locks
 * so an accept cannot race a deletion request into an active conversation.
 */
async function requireAvailableParticipants(
  database: Pick<DayliDatabase, "select">,
  leftUserId: string,
  rightUserId: string,
): Promise<void> {
  const userIds = [leftUserId, rightUserId].sort();
  for (const userId of userIds) {
    const rows = await database
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .for("update");
    if (rows.length !== 1) throw new MessagingError("FORBIDDEN");
  }

  // PostgreSQL's READ COMMITTED snapshot is statement-scoped. This must be a
  // separate statement after the canonical locks, otherwise joined lifecycle
  // state can have been snapshotted before waiting for a lifecycle transaction.
  const availability = await database
    .select({
      userId: schema.user.id,
      lifecycleState: schema.accountLifecycles.state,
      participantId: schema.messagingParticipants.id,
      participantState: schema.messagingParticipants.state,
    })
    .from(schema.user)
    .leftJoin(schema.accountLifecycles, eq(schema.accountLifecycles.userId, schema.user.id))
    .leftJoin(schema.messagingParticipants, eq(schema.messagingParticipants.userId, schema.user.id))
    .where(inArray(schema.user.id, userIds));
  if (availability.length !== userIds.length || availability.some((row) => (
    row.participantId === null
    || row.participantState !== "active"
    || (row.lifecycleState !== null && row.lifecycleState !== "active")
  ))) {
    throw new MessagingError("FORBIDDEN");
  }
}

async function conversationAfterResolution(
  database: DayliDatabase,
  actorId: string,
  conversationId: string,
) {
  const row = await requireConversationMember(database, actorId, conversationId);
  const peerParticipantId = String(row.participant_low_id) === String(row.member_participant_id)
    ? row.participant_high_id
    : row.participant_low_id;
  if (!peerParticipantId) throw new Error("Conversation peer participant is missing.");
  const lastReadSequence = Number(requireSafeSequenceBigInt(row.last_read_sequence));
  const [peer] = await database
    .select({
      id: schema.messagingParticipants.id,
      name: sql<string | null>`case when ${schema.messagingParticipants.state} = 'active'
          and coalesce(${schema.accountLifecycles.state}, 'active') = 'active'
        then coalesce(nullif(${schema.user.displayUsername}, ''), nullif(${schema.user.username}, ''))
        else 'Deleted account'
      end`,
    })
    .from(schema.messagingParticipants)
    .leftJoin(schema.user, eq(schema.user.id, schema.messagingParticipants.userId))
    .leftJoin(schema.accountLifecycles, eq(schema.accountLifecycles.userId, schema.user.id))
    .where(eq(schema.messagingParticipants.id, peerParticipantId))
    .limit(1);
  if (!peer) throw new Error("Conversation peer participant is missing.");
  const [latest] = await database
    .select(messageProjectionSelection)
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .orderBy(desc(schema.messages.sequence))
    .limit(1);
  const [unread] = await database
    .select({ count: count() })
    .from(schema.messages)
    .where(and(
      eq(schema.messages.conversationId, conversationId),
      ne(schema.messages.senderParticipantId, row.member_participant_id!),
      gt(schema.messages.sequence, lastReadSequence),
      isNull(schema.messages.unsentAt),
    ));
  return projectConversationDto(database, {
    ...row,
    peer_id: peer.id,
    peer_name: peer.name,
    peer_deleted: peer.name === "Deleted account",
    unread_count: unread?.count ?? 0,
    latestMessage: latest ?? null,
  }, actorId);
}

export function createPostgresResolveMessageRequestRepository(
  database: DayliDatabase,
): ResolveMessageRequestRepository {
  return {
    async resolve(actorId, conversationId, decision) {
      await database.transaction(async (tx) => {
        const [pair] = await tx
          .select({
            userLowId: schema.conversations.userLowId,
            userHighId: schema.conversations.userHighId,
          })
          .from(schema.conversations)
          .where(eq(schema.conversations.id, conversationId))
          .limit(1);
        if (!pair) throw new MessagingError("NOT_FOUND");
        // Positive activation locks lifecycle user rows first, then follows the
        // established pair and conversation order. Decline remains a safe
        // negative transition and does not require an availability grant.
        if (decision === "accept") {
          await requireAvailableParticipants(tx, pair.userLowId, pair.userHighId);
        }
        await lockRelationshipPair(tx, pair.userLowId, pair.userHighId);

        const row = await requireConversationMember(tx, actorId, conversationId, true);
        if (row.blocked === true) throw new MessagingError("BLOCKED");
        const state = decision === "accept" ? "active" : "declined";
        if (String(row.initiator_participant_id) === String(row.member_participant_id)) throw new MessagingError("FORBIDDEN");
        if (row.request_state === state) return;
        if (row.request_state !== "pending") throw new MessagingError("FORBIDDEN");

        await tx
          .update(schema.conversations)
          .set({ requestState: state, updatedAt: sql`now()` })
          .where(eq(schema.conversations.id, conversationId));
        await appendConversationChange(tx, conversationId, `request.${state}`, null, actorId, new Date());
      });
      return conversationAfterResolution(database, actorId, conversationId);
    },
  };
}

export function createHyperdriveResolveMessageRequestRepository(
  hyperdrive: HyperdriveBinding,
): ResolveMessageRequestRepository {
  return {
    async resolve(actorId, conversationId, decision) {
      const database = createHyperdriveDatabase(hyperdrive);
      try {
        return await createPostgresResolveMessageRequestRepository(database.db).resolve(
          actorId,
          conversationId,
          decision,
        );
      } finally {
        await database.close();
      }
    },
  };
}
