import { schema, sql, type DayliDatabase } from "@dayli/db";
import { and, eq, exists, gt, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { loadReactionSummaries, messageProjectionSelection, toStoredMessage } from "../../shared/message-projection";
import { requireSafeSequenceBigInt } from "../../shared/safe-sequence";
import type { ConversationAccess, ConversationPeerChange, StoredMessage } from "../../shared/messaging-types";

export type MessageWriteQueryable = Pick<DayliDatabase, "delete" | "insert" | "select" | "update">;

export async function getAccess(queryable: MessageWriteQueryable, actorId: string, conversationId: string): Promise<ConversationAccess> {
  const member = exists(queryable
    .select({ conversationId: schema.conversationMembers.conversationId })
    .from(schema.conversationMembers)
    .where(and(
      eq(schema.conversationMembers.conversationId, schema.conversations.id),
      eq(schema.conversationMembers.userId, actorId),
    )));
  const blocked = exists(queryable
    .select({ blockerId: schema.relationshipBlocks.blockerId })
    .from(schema.relationshipBlocks)
    .where(and(
      isNull(schema.relationshipBlocks.unblockedAt),
      or(
        and(
          eq(schema.relationshipBlocks.blockerId, schema.conversations.userLowId),
          eq(schema.relationshipBlocks.blockedId, schema.conversations.userHighId),
        ),
        and(
          eq(schema.relationshipBlocks.blockerId, schema.conversations.userHighId),
          eq(schema.relationshipBlocks.blockedId, schema.conversations.userLowId),
        ),
      ),
    )));
  const availableParticipant = (
    userId: typeof schema.conversations.userLowId | typeof schema.conversations.userHighId,
  ) => exists(queryable
    .select({ id: schema.user.id })
    .from(schema.user)
    .innerJoin(schema.messagingParticipants, eq(schema.messagingParticipants.userId, schema.user.id))
    .leftJoin(schema.accountLifecycles, eq(schema.accountLifecycles.userId, schema.user.id))
    .where(and(
      eq(schema.user.id, userId),
      eq(schema.messagingParticipants.state, "active"),
      or(isNull(schema.accountLifecycles.state), eq(schema.accountLifecycles.state, "active")),
    )));
  const participantsAvailable = sql<boolean>`${availableParticipant(schema.conversations.userLowId)} and ${availableParticipant(schema.conversations.userHighId)}`;
  const [row] = await queryable
    .select({
      user_low_id: schema.conversations.userLowId,
      user_high_id: schema.conversations.userHighId,
      request_state: schema.conversations.requestState,
      member: member.mapWith(Boolean),
      blocked: blocked.mapWith(Boolean),
      participantsAvailable,
    })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conversationId))
    .limit(1)
    .for("update");
  if (!row) return { conversationId, peerId: "", requestState: "declined", isMember: false, participantsAvailable: false, peerActivityBlocked: false };
  return {
    conversationId,
    peerId: row.user_low_id === actorId ? row.user_high_id : row.user_low_id,
    requestState: row.request_state,
    isMember: row.member,
    participantsAvailable: row.participantsAvailable,
    peerActivityBlocked: row.blocked,
  };
}

export async function findMessage(queryable: MessageWriteQueryable, actorId: string, conversationId: string, messageId: string): Promise<StoredMessage | null> {
  const [row] = await queryable
    .select(messageProjectionSelection)
    .from(schema.messages)
    .where(and(
      eq(schema.messages.conversationId, conversationId),
      eq(schema.messages.id, messageId),
    ))
    .limit(1);
  if (!row) return null;
  const stored = toStoredMessage(row);
  stored.reactions = await loadReactionSummaries(queryable, messageId, actorId);
  return stored;
}

export async function appendPeerChange(queryable: MessageWriteQueryable, input: ConversationPeerChange): Promise<void> {
  const createdAt = new Date();
  const [change] = await queryable
    .update(schema.conversations)
    .set({
      lastChangeSequence: sql`${schema.conversations.lastChangeSequence} + 1`,
      updatedAt: sql`now()`,
    })
    .where(eq(schema.conversations.id, input.conversationId))
    .returning({
      sequence: schema.conversations.lastChangeSequence,
      userLowId: schema.conversations.userLowId,
      userHighId: schema.conversations.userHighId,
    });
  if (!change) throw new Error("Conversation disappeared during change append.");

  requireSafeSequenceBigInt(change.sequence);
  const changeSequence = change.sequence;
  await queryable.insert(schema.conversationChanges).values({
    conversationId: input.conversationId,
    changeSequence,
    kind: input.kind,
    messageId: input.messageId,
    memberId: input.actorId ?? null,
    createdAt,
  });

  const recipients = await queryable
    .select({ id: schema.user.id })
    .from(schema.user)
    .innerJoin(schema.messagingParticipants, eq(schema.messagingParticipants.userId, schema.user.id))
    .leftJoin(schema.accountLifecycles, eq(schema.accountLifecycles.userId, schema.user.id))
    .where(and(
      inArray(schema.user.id, [change.userLowId, change.userHighId]),
      eq(schema.messagingParticipants.state, "active"),
      or(isNull(schema.accountLifecycles.state), eq(schema.accountLifecycles.state, "active")),
    ));
  if (recipients.length > 0) {
    const eventId = crypto.randomUUID();
    await queryable.insert(schema.messagingOutbox).values(recipients.map((recipient) => ({
      id: crypto.randomUUID(),
      eventId,
      recipientId: recipient.id,
      conversationId: input.conversationId,
      changeSequence,
      channel: "realtime" as const,
      status: "pending" as const,
      attempts: 0,
      availableAt: createdAt,
      createdAt,
    })));
  }

  if (input.kind !== "message.created" || !input.messageId) return;

  const [message] = await queryable
    .select({ senderId: schema.messages.senderId })
    .from(schema.messages)
    .where(eq(schema.messages.id, input.messageId))
    .limit(1);
  const peerId = message?.senderId === change.userLowId ? change.userHighId : change.userLowId;
  const devices = await queryable
    .select({ id: schema.pushDevices.id })
    .from(schema.pushDevices)
    .innerJoin(schema.messagingParticipants, and(
      eq(schema.messagingParticipants.userId, schema.pushDevices.userId),
      eq(schema.messagingParticipants.state, "active"),
    ))
    .leftJoin(schema.accountLifecycles, eq(schema.accountLifecycles.userId, schema.pushDevices.userId))
    .innerJoin(schema.session, and(
      eq(schema.session.id, schema.pushDevices.sessionId),
      eq(schema.session.userId, schema.pushDevices.userId),
      gt(schema.session.expiresAt, sql`now()`),
    ))
    .where(and(
      eq(schema.pushDevices.userId, peerId),
      eq(schema.pushDevices.optedIn, true),
      or(isNull(schema.accountLifecycles.state), eq(schema.accountLifecycles.state, "active")),
      isNull(schema.pushDevices.invalidatedAt),
      isNotNull(schema.pushDevices.tokenCiphertext),
      isNotNull(schema.pushDevices.tokenKeyVersion),
    ));
  for (const device of devices) {
    await queryable.insert(schema.messagingOutbox).values({
      id: crypto.randomUUID(),
      eventId: crypto.randomUUID(),
      recipientId: peerId,
      conversationId: input.conversationId,
      changeSequence,
      channel: "push",
      deviceRegistrationId: device.id,
      status: "pending",
      attempts: 0,
      availableAt: createdAt,
      createdAt,
    });
  }
}
