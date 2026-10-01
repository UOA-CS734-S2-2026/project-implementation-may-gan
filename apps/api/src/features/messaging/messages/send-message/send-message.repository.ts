import { createHyperdriveDatabase, schema, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { and, eq } from "drizzle-orm";
import { withLockedConversationMessageTransaction } from "../shared/conversation-message-transaction";
import { appendPeerChange, findMessage, getAccess, mapStoredMessage, type MessageWriteQueryable } from "../shared/message-write-primitives";
import type { ConversationAccess, ConversationPeerChange, StoredMessage } from "../../shared/messaging-types";
import { requireSafeSequenceText } from "../../shared/safe-sequence";

export interface StoredIdempotentMessage {
  requestFingerprint: string;
  message: StoredMessage;
}

/**
 * This action-local transaction requires the relationship-pair advisory lock
 * before access resolution and a conversation row lock before message writes.
 */
export interface SendMessageTransaction {
  getAccess(actorId: string, conversationId: string): Promise<ConversationAccess>;
  activateForFriendship(actorId: string, conversationId: string): Promise<ConversationAccess>;
  findIdempotentMessage(senderId: string, clientMessageId: string): Promise<StoredIdempotentMessage | null>;
  findMessage(conversationId: string, messageId: string): Promise<StoredMessage | null>;
  insertMessage(input: {
    id: string;
    conversationId: string;
    senderId: string;
    clientMessageId: string;
    requestFingerprint: string;
    text: string;
    replyToMessageId: string | null;
    createdAt: Date;
  }): Promise<StoredMessage>;
  appendPeerChange(input: ConversationPeerChange): Promise<void>;
}

export interface SendMessageStore {
  withConversationTransaction<T>(
    actorId: string,
    conversationId: string,
    operation: (transaction: SendMessageTransaction) => Promise<T>,
  ): Promise<T>;
}

class PostgresMessageTransaction implements SendMessageTransaction {
  constructor(private readonly queryable: MessageWriteQueryable, private readonly actorId: string, private readonly conversationId: string) {}
  async getAccess(actorId: string, conversationId: string): Promise<ConversationAccess> {
    return getAccess(this.queryable, actorId, conversationId);
  }
  async activateForFriendship(actorId: string, conversationId: string): Promise<ConversationAccess> {
    const access = await this.getAccess(actorId, conversationId);
    if (access.requestState === "active" || access.peerActivityBlocked || !access.isMember) return access;
    const [friendship] = await this.queryable
      .select({ userId: schema.friendships.userId })
      .from(schema.friendships)
      .where(and(
        eq(schema.friendships.userId, actorId),
        eq(schema.friendships.friendId, access.peerId),
        eq(schema.friendships.state, "active"),
      ))
      .limit(1);
    if (!friendship) return access;
    await this.queryable
      .update(schema.conversations)
      .set({ requestState: "active", updatedAt: sql`now()` })
      .where(eq(schema.conversations.id, conversationId));
    await this.appendPeerChange({ conversationId, messageId: null, kind: "request.active" });
    return this.getAccess(actorId, conversationId);
  }
  async findIdempotentMessage(senderId: string, clientMessageId: string): Promise<StoredIdempotentMessage | null> {
    const [row] = await this.queryable
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
        eq(schema.messages.senderParticipantId, senderId),
        eq(schema.messages.clientMessageId, clientMessageId),
      ))
      .limit(1);
    return row ? { requestFingerprint: row.request_fingerprint, message: mapStoredMessage(row) } : null;
  }
  async findMessage(conversationId: string, messageId: string): Promise<StoredMessage | null> {
    return findMessage(this.queryable, this.actorId, conversationId, messageId);
  }
  async insertMessage(input: Parameters<SendMessageTransaction["insertMessage"]>[0]): Promise<StoredMessage> {
    const [allocated] = await this.queryable
      .update(schema.conversations)
      .set({
        lastMessageSequence: sql`${schema.conversations.lastMessageSequence} + 1`,
        lastActivityAt: input.createdAt,
        updatedAt: input.createdAt,
      })
      .where(eq(schema.conversations.id, input.conversationId))
      .returning({ sequence: sql<string>`${schema.conversations.lastMessageSequence}::text` });
    if (!allocated) throw new Error("Conversation disappeared during message insert.");
    const sequence = requireSafeSequenceText(allocated.sequence);
    const [message] = await this.queryable
      .insert(schema.messages)
      .values({
        id: input.id,
        conversationId: input.conversationId,
        sequence: sql`${sequence}::bigint`,
        senderParticipantId: input.senderId,
        clientMessageId: input.clientMessageId,
        requestFingerprint: input.requestFingerprint,
        body: input.text,
        replyToMessageId: input.replyToMessageId,
        version: 1,
        createdAt: input.createdAt,
      })
      .returning({
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
      });
    return mapStoredMessage(message!);
  }
  async appendPeerChange(input: ConversationPeerChange): Promise<void> {
    return appendPeerChange(this.queryable, input);
  }
}

export function createPostgresMessageWriteStore(database: DayliDatabase): SendMessageStore {
  return {
    withConversationTransaction: (actorId, conversationId, operation) =>
      database.transaction((transaction) =>
        withLockedConversationMessageTransaction(transaction, conversationId, (lockedTransaction) =>
          operation(new PostgresMessageTransaction(lockedTransaction, actorId, conversationId)))),
  };
}

export function createHyperdriveMessageWriteStore(hyperdrive: HyperdriveBinding): SendMessageStore {
  return {
    async withConversationTransaction(actorId, conversationId, operation) {
      const database = createHyperdriveDatabase(hyperdrive);
      try {
        return await database.db.transaction((transaction) =>
          withLockedConversationMessageTransaction(transaction, conversationId, (lockedTransaction) =>
            operation(new PostgresMessageTransaction(lockedTransaction, actorId, conversationId))));
      } finally {
        await database.close();
      }
    },
  };
}
