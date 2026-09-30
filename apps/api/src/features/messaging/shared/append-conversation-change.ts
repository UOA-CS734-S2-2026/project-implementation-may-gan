import { schema, sql, type DayliDatabase } from "@dayli/db";
import { and, eq, gt, isNotNull, isNull } from "drizzle-orm";

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
      sequence: sql<string>`${schema.conversations.lastChangeSequence}::text`,
      userLowId: schema.conversations.userLowId,
      userHighId: schema.conversations.userHighId,
    });
  if (!change) throw new Error("Conversation disappeared during change append.");

  const changeSequence = sql`${change.sequence}::bigint`;
  await queryable.insert(schema.conversationChanges).values({
    conversationId,
    changeSequence,
    kind,
    messageId,
    memberId,
    createdAt: now,
  });

  const eventId = crypto.randomUUID();
  await queryable.insert(schema.messagingOutbox).values([
    {
      id: crypto.randomUUID(),
      eventId,
      recipientId: change.userLowId,
      conversationId,
      changeSequence,
      channel: "realtime",
      status: "pending",
      attempts: 0,
      availableAt: now,
      createdAt: now,
    },
    {
      id: crypto.randomUUID(),
      eventId,
      recipientId: change.userHighId,
      conversationId,
      changeSequence,
      channel: "realtime",
      status: "pending",
      attempts: 0,
      availableAt: now,
      createdAt: now,
    },
  ]);

  if (kind !== "message.created" || !messageId) return;

  const [message] = await queryable
    .select({ senderId: schema.messages.senderId })
    .from(schema.messages)
    .where(eq(schema.messages.id, messageId));
  const peerId = message?.senderId === change.userLowId ? change.userHighId : change.userLowId;
  const devices = await queryable
    .select({ id: schema.pushDevices.id })
    .from(schema.pushDevices)
    .innerJoin(schema.session, and(
      eq(schema.session.id, schema.pushDevices.sessionId),
      eq(schema.session.userId, schema.pushDevices.userId),
      gt(schema.session.expiresAt, sql`now()`),
    ))
    .where(and(
      eq(schema.pushDevices.userId, peerId),
      eq(schema.pushDevices.optedIn, true),
      isNull(schema.pushDevices.invalidatedAt),
      isNotNull(schema.pushDevices.tokenCiphertext),
      isNotNull(schema.pushDevices.tokenKeyVersion),
    ));

  for (const device of devices) {
    await queryable.insert(schema.messagingOutbox).values({
      id: crypto.randomUUID(),
      eventId: crypto.randomUUID(),
      recipientId: peerId,
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
