import { schema, sql, type DayliDatabase } from "@dayli/db";
import { and, eq, exists, gt, isNotNull, isNull, or } from "drizzle-orm";
import { loadReactionSummaries, messageProjectionSelection, toStoredMessage } from "../../shared/message-projection";
import { requireSafeSequenceBigInt } from "../../shared/safe-sequence";
import type { ConversationAccess, ConversationPeerChange, StoredMessage } from "../../shared/messaging-types";
import { participantIdForUser } from "../../shared/participant-identity";
import { activeUserIdForParticipant, conversationPairBlocked, conversationParticipantsAvailable } from "../../shared/conversation-participants";
import { publishDirectMessageNotification } from "../../shared/direct-message-notification";

export type MessageWriteQueryable = Pick<DayliDatabase, "delete" | "insert" | "select" | "update">;

export async function getAccess(queryable: MessageWriteQueryable, actorId: string, conversationId: string): Promise<ConversationAccess> {
  const member = exists(queryable
    .select({ conversationId: schema.conversationMembers.conversationId })
    .from(schema.conversationMembers)
    .where(and(
      eq(schema.conversationMembers.conversationId, schema.conversations.id),
      eq(schema.conversationMembers.participantId, participantIdForUser(actorId)),
    )));
  const blocked = conversationPairBlocked(
    queryable,
    schema.conversations.participantLowId,
    schema.conversations.participantHighId,
  );
  const participantsAvailable = conversationParticipantsAvailable(
    schema.conversations.participantLowId,
    schema.conversations.participantHighId,
  );
  const [row] = await queryable
    .select({
      participant_low_id: schema.conversations.participantLowId,
      participant_high_id: schema.conversations.participantHighId,
      actor_participant_id: participantIdForUser(actorId),
      peer_user_id: activeUserIdForParticipant(sql`case when ${schema.conversations.participantLowId} = ${participantIdForUser(actorId)} then ${schema.conversations.participantHighId} else ${schema.conversations.participantLowId} end`),
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
    peerId: row.peer_user_id ?? "",
    actorParticipantId: row.member ? row.actor_participant_id ?? undefined : undefined,
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

export async function appendPeerChange(
  queryable: MessageWriteQueryable,
  input: ConversationPeerChange,
  options: { notificationPublishersEnabled?: boolean } = {},
): Promise<void> {
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
      participantLowId: schema.conversations.participantLowId,
      participantHighId: schema.conversations.participantHighId,
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
    memberParticipantId: input.actorId === undefined ? null : participantIdForUser(input.actorId),
    createdAt,
  });

  const recipients = await queryable
    .select({ id: schema.user.id })
    .from(schema.messagingParticipants)
    .innerJoin(schema.user, eq(schema.user.id, schema.messagingParticipants.userId))
    .leftJoin(schema.accountLifecycles, eq(schema.accountLifecycles.userId, schema.user.id))
    .where(and(
      or(
        eq(schema.messagingParticipants.id, change.participantLowId!),
        eq(schema.messagingParticipants.id, change.participantHighId!),
      ),
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

  if (input.kind !== "message.created" || !input.messageId || !options.notificationPublishersEnabled) return;

  const [message] = await queryable
    .select({ senderParticipantId: schema.messages.senderParticipantId })
    .from(schema.messages)
    .where(eq(schema.messages.id, input.messageId))
    .limit(1);
  const peerParticipantId = message?.senderParticipantId === change.participantLowId
    ? change.participantHighId
    : change.participantLowId;
  if (!peerParticipantId) throw new Error("Conversation peer participant is missing.");
  const [recipient] = await queryable
    .select({ id: schema.messagingParticipants.userId })
    .from(schema.messagingParticipants)
    .where(and(
      eq(schema.messagingParticipants.id, peerParticipantId),
      eq(schema.messagingParticipants.state, "active"),
      isNotNull(schema.messagingParticipants.userId),
    ))
    .limit(1);
  if (!recipient?.id) return;

  const devices = await queryable
    .select({ id: schema.pushDevices.id, recipientId: schema.user.id })
    .from(schema.pushDevices)
    .innerJoin(schema.messagingParticipants, and(
      eq(schema.messagingParticipants.id, peerParticipantId),
      eq(schema.messagingParticipants.userId, schema.pushDevices.userId),
      eq(schema.messagingParticipants.state, "active"),
    ))
    .innerJoin(schema.user, eq(schema.user.id, schema.messagingParticipants.userId))
    .innerJoin(schema.accountNotificationPreferences, and(
      eq(schema.accountNotificationPreferences.userId, schema.pushDevices.userId),
      eq(schema.accountNotificationPreferences.enabled, true),
    ))
    .leftJoin(schema.accountLifecycles, eq(schema.accountLifecycles.userId, schema.pushDevices.userId))
    .innerJoin(schema.session, and(
      eq(schema.session.id, schema.pushDevices.sessionId),
      eq(schema.session.userId, schema.pushDevices.userId),
      gt(schema.session.expiresAt, sql`now()`),
    ))
    .where(and(
      eq(schema.pushDevices.optedIn, true),
      isNull(schema.pushDevices.notificationSchemaVersion),
      or(isNull(schema.accountLifecycles.state), eq(schema.accountLifecycles.state, "active")),
      isNull(schema.pushDevices.invalidatedAt),
      isNotNull(schema.pushDevices.tokenCiphertext),
      isNotNull(schema.pushDevices.tokenKeyVersion),
    ));
  await publishDirectMessageNotification(queryable, {
    messageId: input.messageId,
    conversationId: input.conversationId,
    recipientId: recipient.id,
    createdAt,
  });

  for (const device of devices) {
    await queryable.insert(schema.messagingOutbox).values({
      id: crypto.randomUUID(),
      eventId: crypto.randomUUID(),
      recipientId: device.recipientId,
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
