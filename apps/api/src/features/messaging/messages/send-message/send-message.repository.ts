import { createHyperdriveDatabase, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { withLockedConversationMessageTransaction } from "../shared/conversation-message-transaction";
import { appendPeerChange, findMessage, getAccess, mapStoredMessage, type MessageWriteQueryable } from "../shared/message-write-primitives";
import type { ConversationAccess, ConversationPeerChange, StoredMessage } from "../../shared/messaging-types";

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

type Row = Record<string, unknown>;
const rows = <T extends Row>(value: unknown) => [...value as Iterable<T>];

class PostgresMessageTransaction implements SendMessageTransaction {
  constructor(private readonly queryable: MessageWriteQueryable, private readonly actorId: string, private readonly conversationId: string) {}
  async getAccess(actorId: string, conversationId: string): Promise<ConversationAccess> {
    return getAccess(this.queryable, actorId, conversationId);
  }
  async activateForFriendship(actorId: string, conversationId: string): Promise<ConversationAccess> { const access = await this.getAccess(actorId, conversationId); if (access.requestState === "active" || access.peerActivityBlocked || !access.isMember) return access; const [friendship] = rows<{ active: boolean }>(await this.queryable.execute(sql`select exists(select 1 from public.friendships where user_id = ${actorId} and friend_id = ${access.peerId} and state = 'active') as active`)); if (friendship?.active !== true) return access; await this.queryable.execute(sql`update public.conversations set request_state = 'active', updated_at = now() where id = ${conversationId}`); await this.appendPeerChange({ conversationId, messageId: null, kind: "request.active" }); return this.getAccess(actorId, conversationId); }
  async findIdempotentMessage(senderId: string, clientMessageId: string): Promise<StoredIdempotentMessage | null> {
    const [row] = rows<Row>(await this.queryable.execute(sql`select * from public.messages where sender_id = ${senderId} and client_message_id = ${clientMessageId}`));
    return row ? { requestFingerprint: String(row.request_fingerprint), message: mapStoredMessage(row) } : null;
  }
  async findMessage(conversationId: string, messageId: string): Promise<StoredMessage | null> {
    return findMessage(this.queryable, this.actorId, conversationId, messageId);
  }
  async insertMessage(input: Parameters<SendMessageTransaction["insertMessage"]>[0]): Promise<StoredMessage> {
    const [allocated] = rows<{ sequence: unknown }>(await this.queryable.execute(sql`update public.conversations set last_message_sequence = last_message_sequence + 1, last_activity_at = ${input.createdAt.toISOString()}::timestamptz, updated_at = ${input.createdAt.toISOString()}::timestamptz where id = ${input.conversationId} returning last_message_sequence as sequence`));
    if (!allocated) throw new Error("Conversation disappeared during message insert.");
    const result = await this.queryable.execute(sql`insert into public.messages (id, conversation_id, sequence, sender_id, client_message_id, request_fingerprint, body, reply_to_message_id, version, created_at) values (${input.id}, ${input.conversationId}, ${allocated.sequence}::bigint, ${input.senderId}, ${input.clientMessageId}, ${input.requestFingerprint}, ${input.text}, ${input.replyToMessageId}, 1, ${input.createdAt.toISOString()}::timestamptz) returning *`);
    return mapStoredMessage(rows<Row>(result)[0]!);
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
