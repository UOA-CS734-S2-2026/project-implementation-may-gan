import { lockRelationshipPair, schema, sql, type DayliDatabase } from "@dayli/db";
import { and, asc, eq, exists, inArray, isNull, or, type SQL, type SQLWrapper } from "drizzle-orm";

type Selectable = Pick<DayliDatabase, "select">;

/**
 * Resolves a participant through its live mapping, rather than through a
 * conversation's legacy user columns. A detached participant deliberately has
 * no current user identity.
 */
export function activeUserIdForParticipant(participantId: SQLWrapper): SQL<string | null> {
  return sql<string | null>`(
    select ${schema.messagingParticipants.userId}
    from ${schema.messagingParticipants}
    left join ${schema.accountLifecycles}
      on ${schema.accountLifecycles.userId} = ${schema.messagingParticipants.userId}
    where ${schema.messagingParticipants.id} = ${participantId}
      and ${schema.messagingParticipants.state} = 'active'
      and ${schema.messagingParticipants.userId} is not null
      and (${schema.accountLifecycles.state} is null or ${schema.accountLifecycles.state} = 'active')
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

  const rows = await queryable
    .select({ participantId: schema.messagingParticipants.id, userId: schema.messagingParticipants.userId })
    .from(schema.messagingParticipants)
    .leftJoin(schema.accountLifecycles, eq(schema.accountLifecycles.userId, schema.messagingParticipants.userId))
    .where(and(
      inArray(schema.messagingParticipants.id, [conversation.participantLowId, conversation.participantHighId]),
      eq(schema.messagingParticipants.state, "active"),
      or(isNull(schema.accountLifecycles.state), eq(schema.accountLifecycles.state, "active")),
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
 * Locks the live account rows that a conversation currently maps to, in
 * canonical order. The mapping is read again after waiting: a lifecycle can
 * detach a peer between the first read and the locks, in which case callers
 * see the peer unavailable instead of using stale legacy IDs.
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
