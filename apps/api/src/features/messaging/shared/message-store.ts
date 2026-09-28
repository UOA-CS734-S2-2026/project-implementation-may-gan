import type { ConversationAccess, ReactionKey, StoredMessage } from "./messaging-types";

export interface StoredIdempotentMessage {
  requestFingerprint: string;
  message: StoredMessage;
}

/**
 * This is deliberately a narrow action-oriented transaction interface rather
 * than a generic repository. Its production implementation must acquire the
 * exported relationship pair advisory lock before it resolves access, then
 * lock the conversation row before message reads or writes.
 */
export interface MessageWriteTransaction {
  getAccess(actorId: string, conversationId: string): Promise<ConversationAccess>;
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
  updateMessage(input: {
    messageId: string;
    body?: string | null;
    editedAt?: Date | null;
    unsentAt?: Date | null;
    expectedVersion?: number;
  }): Promise<StoredMessage>;
  setReaction(messageId: string, actorId: string, reaction: ReactionKey): Promise<StoredMessage>;
  removeReaction(messageId: string, actorId: string): Promise<StoredMessage>;
  /** Atomically appends the change record and body-free realtime delivery intent. */
  appendPeerChange(input: { conversationId: string; messageId: string; kind: "message.created" | "message.edited" | "message.unsent" | "reaction.changed" }): Promise<void>;
}

export interface MessageWriteStore {
  withConversationTransaction<T>(
    actorId: string,
    conversationId: string,
    operation: (transaction: MessageWriteTransaction) => Promise<T>,
  ): Promise<T>;
}
