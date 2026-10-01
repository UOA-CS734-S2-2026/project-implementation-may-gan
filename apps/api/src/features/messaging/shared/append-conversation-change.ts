import { schema, sql, type DayliDatabase } from "@dayli/db";
import { and, eq, gt, inArray, isNotNull, isNull } from "drizzle-orm";

type Queryable = Pick<DayliDatabase, "insert" | "select" | "update">;

/** Appends a durable change and its outbox records within the caller's transaction. */
export async function appendConversationChange(
  queryable: Queryable,
  conversationId: string,
  kind: string,
  messageId: string | null,
  memberParticipantId: string | null,
  now: Date,
): Promise<void> {
  const [change] = await queryable
    .update(schema.conversations)
    .set({
      lastChangeSequence: sql`${schema.conversations.lastChangeSequence} + 1`,
      updatedAt: now,
    })
    .where(eq(schema.conversations.id, conversationId))
    .returning({
      sequence: sql<string>`${schema.conversations.lastChangeSequence}::text`,
      participantLowId: schema.conversations.participantLowId,
      participantHighId: schema.conversations.participantHighId,
    });
  if (!change) throw new Error("Conversation disappeared during change append.");

  const changeSequence = sql`${change.sequence}::bigint`;
  await queryable.insert(schema.conversationChanges).values({
    conversationId,
    changeSequence,
    kind,
    messageId,
    memberParticipantId,
    createdAt: now,
  });

  const recipients = await queryable
    .select({ userId: schema.messagingParticipants.userId })
    .from(schema.messagingParticipants)
    .where(and(
      inArray(schema.messagingParticipants.id, [change.participantLowId, change.participantHighId]),
      eq(schema.messagingParticipants.state, "active"),
      isNotNull(schema.messagingParticipants.userId),
    ));
  const eventId = crypto.randomUUID();
  if (recipients.length > 0) {
    await queryable.insert(schema.messagingOutbox).values(recipients.map((recipient) => ({
      id: crypto.randomUUID(),
      eventId,
      recipientId: recipient.userId!,
      conversationId,
      changeSequence,
      channel: "realtime" as const,
      status: "pending" as const,
      attempts: 0,
      availableAt: now,
      createdAt: now,
    })));
  }

  if (kind !== "message.created" || !messageId) return;

  const [message] = await queryable
    .select({ senderParticipantId: schema.messages.senderParticipantId })
    .from(schema.messages)
    .where(eq(schema.messages.id, messageId));
  const peerParticipantId = message?.senderParticipantId === change.participantLowId
    ? change.participantHighId
    : change.participantLowId;
  const [peer] = await queryable
    .select({ userId: schema.messagingParticipants.userId })
    .from(schema.messagingParticipants)
    .where(and(
      eq(schema.messagingParticipants.id, peerParticipantId),
      eq(schema.messagingParticipants.state, "active"),
      isNotNull(schema.messagingParticipants.userId),
    ));
  if (!peer?.userId) return;
  const devices = await queryable
    .select({ id: schema.pushDevices.id })
    .from(schema.pushDevices)
    .innerJoin(schema.session, and(
      eq(schema.session.id, schema.pushDevices.sessionId),
      eq(schema.session.userId, schema.pushDevices.userId),
      gt(schema.session.expiresAt, sql`now()`),
    ))
    .where(and(
      eq(schema.pushDevices.userId, peer.userId),
      eq(schema.pushDevices.optedIn, true),
      isNull(schema.pushDevices.invalidatedAt),
      isNotNull(schema.pushDevices.tokenCiphertext),
      isNotNull(schema.pushDevices.tokenKeyVersion),
    ));

  for (const device of devices) {
    await queryable.insert(schema.messagingOutbox).values({
      id: crypto.randomUUID(),
      eventId: crypto.randomUUID(),
      recipientId: peer.userId,
      conversationId,
      changeSequence,
      channel: "push",
      deviceRegistrationId: device.id,
      status: "pending",
      attempts: 0,
      availableAt: now,
      createdAt: now,
    });
  }
}
