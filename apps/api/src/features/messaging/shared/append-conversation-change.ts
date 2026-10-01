import { schema, sql, type DayliDatabase } from "@dayli/db";
import { and, eq, gt, isNotNull, isNull, or } from "drizzle-orm";

type Queryable = Pick<DayliDatabase, "insert" | "select" | "update">;

/** Appends a durable change and its outbox records within the caller's transaction. */
export async function appendConversationChange(
  queryable: Queryable,
  conversationId: string,
  kind: string,
  messageId: string | null,
  memberId: string | null,
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
      sequence: schema.conversations.lastChangeSequence,
      participantLowId: schema.conversations.participantLowId,
      participantHighId: schema.conversations.participantHighId,
    });
  if (!change) throw new Error("Conversation disappeared during change append.");

  const changeSequence = change.sequence;
  if (!Number.isSafeInteger(changeSequence) || changeSequence < 0) {
    throw new RangeError("Database sequence must be a safe nonnegative integer.");
  }
  await queryable.insert(schema.conversationChanges).values({
    conversationId,
    changeSequence,
    kind,
    messageId,
    memberId,
    memberParticipantId: memberId === null ? null : sql<string>`(
      select ${schema.messagingParticipants.id}
      from ${schema.messagingParticipants}
      where ${eq(schema.messagingParticipants.userId, memberId)}
      limit 1
    )`,
    createdAt: now,
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
  if (!peerParticipantId) throw new Error("Conversation peer participant is missing.");
  const devices = await queryable
    .select({ id: schema.pushDevices.id, recipientId: schema.user.id })
    .from(schema.pushDevices)
    .innerJoin(schema.messagingParticipants, and(
      eq(schema.messagingParticipants.id, peerParticipantId),
      eq(schema.messagingParticipants.userId, schema.pushDevices.userId),
      eq(schema.messagingParticipants.state, "active"),
    ))
    .innerJoin(schema.user, eq(schema.user.id, schema.messagingParticipants.userId))
    .leftJoin(schema.accountLifecycles, eq(schema.accountLifecycles.userId, schema.pushDevices.userId))
    .innerJoin(schema.session, and(
      eq(schema.session.id, schema.pushDevices.sessionId),
      eq(schema.session.userId, schema.pushDevices.userId),
      gt(schema.session.expiresAt, sql`now()`),
    ))
    .where(and(
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
      recipientId: device.recipientId,
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
