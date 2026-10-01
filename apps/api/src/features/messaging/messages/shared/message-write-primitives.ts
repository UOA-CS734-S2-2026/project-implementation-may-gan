import { schema, sql, type DayliDatabase } from "@dayli/db";
import { and, eq, exists, gt, inArray, isNotNull, isNull, or } from "drizzle-orm";
import type { ConversationAccess, ConversationPeerChange, StoredMessage } from "../../shared/messaging-types";

export type MessageWriteQueryable = Pick<DayliDatabase, "delete" | "insert" | "select" | "update">;
type Row = Record<string, unknown>;
const bigint = (value: unknown) => typeof value === "bigint" ? value : BigInt(String(value));
const safeInteger = (value: unknown, field: string): number => {
  const parsed = bigint(value);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER) || parsed < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError(`${field} exceeds the JavaScript safe integer range.`);
  }
  return Number(parsed);
};

export function mapStoredMessage(row: Row): StoredMessage {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    sequence: bigint(row.sequence),
    senderId: String(row.sender_id),
    clientMessageId: String(row.client_message_id),
    requestFingerprint: String(row.request_fingerprint),
    body: row.body === null ? null : String(row.body),
    replyToMessageId: row.reply_to_message_id === null ? null : String(row.reply_to_message_id),
    version: safeInteger(row.version, "Message version"),
    createdAt: new Date(String(row.created_at)),
    editedAt: row.edited_at ? new Date(String(row.edited_at)) : null,
    unsentAt: row.unsent_at ? new Date(String(row.unsent_at)) : null,
    reactions: [],
  };
}

export async function getAccess(queryable: MessageWriteQueryable, actorId: string, conversationId: string): Promise<ConversationAccess> {
  const member = exists(queryable
    .select({ conversationId: schema.conversationMembers.conversationId })
    .from(schema.conversationMembers)
    .where(and(
      eq(schema.conversationMembers.conversationId, schema.conversations.id),
      eq(schema.conversationMembers.participantId, actorId),
    )));
  const blocked = exists(queryable
    .select({ blockerId: schema.relationshipBlocks.blockerId })
    .from(schema.relationshipBlocks)
    .where(and(
      isNull(schema.relationshipBlocks.unblockedAt),
      or(
        and(
          eq(schema.relationshipBlocks.blockerId, schema.conversations.participantLowId),
          eq(schema.relationshipBlocks.blockedId, schema.conversations.participantHighId),
        ),
        and(
          eq(schema.relationshipBlocks.blockerId, schema.conversations.participantHighId),
          eq(schema.relationshipBlocks.blockedId, schema.conversations.participantLowId),
        ),
      ),
    )));
  const peerUnavailable = sql<boolean>`not exists (
    select 1
    from ${schema.messagingParticipants} peer
    inner join ${schema.user} peer_user on peer_user.id = peer.user_id
    where peer.id = case when ${schema.conversations.participantLowId} = ${actorId}
      then ${schema.conversations.participantHighId} else ${schema.conversations.participantLowId} end
      and peer.state = 'active'
      and not exists (
        select 1 from ${schema.accountLifecycles}
        where ${schema.accountLifecycles.userId} = peer_user.id
          and ${schema.accountLifecycles.state} = 'pending_deletion'
      )
  )`;
  const [row] = await queryable
    .select({
      user_low_id: schema.conversations.participantLowId,
      user_high_id: schema.conversations.participantHighId,
      request_state: schema.conversations.requestState,
      member: sql<boolean>`${member}`,
      blocked: sql<boolean>`${blocked}`,
      peer_unavailable: peerUnavailable,
    })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conversationId))
    .limit(1)
    .for("update");
  if (!row) return { conversationId, peerId: "", requestState: "declined", isMember: false, peerUnavailable: false, peerActivityBlocked: false };
  return {
    conversationId,
    peerId: row.user_low_id === actorId ? row.user_high_id : row.user_low_id,
    requestState: row.request_state,
    isMember: row.member,
    peerUnavailable: row.peer_unavailable,
    peerActivityBlocked: row.blocked || row.peer_unavailable,
  };
}

export async function findMessage(queryable: MessageWriteQueryable, actorId: string, conversationId: string, messageId: string): Promise<StoredMessage | null> {
  const [row] = await queryable
    .select({
      id: schema.messages.id,
      conversation_id: schema.messages.conversationId,
      sequence: sql<string>`${schema.messages.sequence}::text`,
      sender_id: schema.messages.senderParticipantId,
      client_message_id: schema.messages.clientMessageId,
      request_fingerprint: schema.messages.requestFingerprint,
      body: schema.messages.body,
      reply_to_message_id: schema.messages.replyToMessageId,
      version: sql<string>`${schema.messages.version}::text`,
      created_at: schema.messages.createdAt,
      edited_at: schema.messages.editedAt,
      unsent_at: schema.messages.unsentAt,
    })
    .from(schema.messages)
    .where(and(
      eq(schema.messages.conversationId, conversationId),
      eq(schema.messages.id, messageId),
    ))
    .limit(1);
  if (!row) return null;

  const stored = mapStoredMessage(row);
  const reactionRows = await queryable
    .select({
      reaction: schema.messageReactions.reaction,
      count: sql<number>`count(*)::int`,
      reacted: sql<boolean>`bool_or(${schema.messageReactions.participantId} = ${actorId})`,
    })
    .from(schema.messageReactions)
    .where(eq(schema.messageReactions.messageId, messageId))
    .groupBy(schema.messageReactions.reaction);
  stored.reactions = reactionRows.map((item) => ({
    reaction: item.reaction as StoredMessage["reactions"][number]["reaction"],
    count: item.count,
    reactedByActor: item.reacted,
  }));
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
      sequence: sql<string>`${schema.conversations.lastChangeSequence}::text`,
      participantLowId: schema.conversations.participantLowId,
      participantHighId: schema.conversations.participantHighId,
    });
  if (!change) throw new Error("Conversation disappeared during change append.");

  const changeSequence = sql`${change.sequence}::bigint`;
  await queryable.insert(schema.conversationChanges).values({
    conversationId: input.conversationId,
    changeSequence,
    kind: input.kind,
    messageId: input.messageId,
    createdAt,
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
    .select({ senderParticipantId: schema.messages.senderParticipantId })
    .from(schema.messages)
    .where(eq(schema.messages.id, input.messageId))
    .limit(1);
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
