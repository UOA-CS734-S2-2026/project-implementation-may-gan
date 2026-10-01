import { lockRelationshipPair, schema, sql, type DayliDatabase } from "@dayli/db";
import { and, asc, eq, exists, inArray, isNull, or, type SQL, type SQLWrapper } from "drizzle-orm";

type Selectable = Pick<DayliDatabase, "select">;

/**
 * Resolves a participant through its live mapping, rather than through a
 * conversation's legacy user columns. A detached participant deliberately has
 * no current user identity.
 */
export function activeUserIdForParticipant(participantId: SQLWrapper): SQL<string | null> {
  // SQL fragments passed as participantId can contain a correlated expression.
  // Keep these subquery columns explicitly qualified so PostgreSQL never binds
  // them to that expression's outer query.
  const participantUserId = sql.raw('"messaging_participants"."user_id"');
  const participantIdColumn = sql.raw('"messaging_participants"."id"');
  const participantState = sql.raw('"messaging_participants"."state"');
  const lifecycleUserId = sql.raw('"account_lifecycles"."user_id"');
  const lifecycleState = sql.raw('"account_lifecycles"."state"');
  return sql<string | null>`(
    select ${participantUserId}
    from ${schema.messagingParticipants}
    left join ${schema.accountLifecycles}
      on ${lifecycleUserId} = ${participantUserId}
    where ${participantIdColumn} = ${participantId}
      and ${participantState} = 'active'
      and ${participantUserId} is not null
      and (${lifecycleState} is null or ${lifecycleState} = 'active')
    limit 1
  )`;
}

export function conversationParticipantsAvailable(
  participantLowId: SQLWrapper,
  participantHighId: SQLWrapper,
): SQL<boolean> {
  const lowUserId = activeUserIdForParticipant(participantLowId);
  const highUserId = activeUserIdForParticipant(participantHighId);
  return sql<boolean>`${lowUserId} is not null and ${highUserId} is not null`;
}

/** Relationship blocks apply only while both durable participants map to live accounts. */
export function conversationPairBlocked(
  queryable: Selectable,
  participantLowId: SQLWrapper,
  participantHighId: SQLWrapper,
) {
  const lowUserId = activeUserIdForParticipant(participantLowId);
  const highUserId = activeUserIdForParticipant(participantHighId);
  return exists(queryable
    .select({ blockerId: schema.relationshipBlocks.blockerId })
    .from(schema.relationshipBlocks)
    .where(and(
      isNull(schema.relationshipBlocks.unblockedAt),
      or(
        and(eq(schema.relationshipBlocks.blockerId, lowUserId), eq(schema.relationshipBlocks.blockedId, highUserId)),
        and(eq(schema.relationshipBlocks.blockerId, highUserId), eq(schema.relationshipBlocks.blockedId, lowUserId)),
      ),
    ))).mapWith(Boolean);
}

export type ActiveConversationParticipants = {
  participantLowId: string;
  participantHighId: string;
  lowUserId: string | null;
  highUserId: string | null;
};

async function activeConversationParticipants(
  queryable: Selectable,
  conversationId: string,
): Promise<ActiveConversationParticipants | null> {
  const [conversation] = await queryable
    .select({
      participantLowId: schema.conversations.participantLowId,
      participantHighId: schema.conversations.participantHighId,
    })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conversationId))
    .limit(1);
  if (!conversation?.participantLowId || !conversation.participantHighId) return null;

  // Lock identity ownership independently from lifecycle availability. A peer
  // in pending deletion still owns a user row, and omitting it would let a
  // cancellation commit between this read and the positive-action recheck.
  const rows = await queryable
    .select({ participantId: schema.messagingParticipants.id, userId: schema.messagingParticipants.userId })
    .from(schema.messagingParticipants)
    .where(and(
      inArray(schema.messagingParticipants.id, [conversation.participantLowId, conversation.participantHighId]),
      eq(schema.messagingParticipants.state, "active"),
    ));
  const users = new Map(rows.filter((row): row is { participantId: string; userId: string } => row.userId !== null)
    .map((row) => [row.participantId, row.userId]));
  return {
    participantLowId: conversation.participantLowId,
    participantHighId: conversation.participantHighId,
    lowUserId: users.get(conversation.participantLowId) ?? null,
    highUserId: users.get(conversation.participantHighId) ?? null,
  };
}

/**
 * Locks every account row that a conversation currently maps to, in canonical
 * order, including a pending-deletion account. The mapping is reread after
 * waiting. Callers then evaluate lifecycle availability from that post-lock
 * snapshot, so a cancellation cannot race a positive action.
 */
export async function lockActiveConversationParticipants(
  transaction: Selectable,
  conversationId: string,
): Promise<ActiveConversationParticipants | null> {
  const before = await activeConversationParticipants(transaction, conversationId);
  if (!before) return null;
  const userIds = [before.lowUserId, before.highUserId].filter((id): id is string => id !== null).sort();
  if (userIds.length > 0) {
    await transaction
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(inArray(schema.user.id, userIds))
      .orderBy(asc(schema.user.id))
      .for("update");
  }
  const after = await activeConversationParticipants(transaction, conversationId);
  if (after?.lowUserId && after.highUserId) {
    await lockRelationshipPair(transaction, after.lowUserId, after.highUserId);
  }
  return after;
}
