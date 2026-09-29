import type { StoredMessage } from "./messaging-types";

export interface DirectConversation {
  id: string;
  requestState: "pending" | "active" | "declined";
  peerId: string;
}

export interface DirectConversationTransaction {
  /**
   * Acquires the shared relationship-pair lock, then reads both directional
   * block rows in the same transaction. It must not be served from a cache.
   */
  isPairBlocked(actorId: string, recipientId: string): Promise<boolean>;
  /** Acquires the relationship-pair lock before resolving either participant. */
  findDirectConversation(actorId: string, recipientId: string): Promise<DirectConversation | null>;
  recipientExists(recipientId: string): Promise<boolean>;
  hasActiveFriendship(actorId: string, recipientId: string): Promise<boolean>;
  findIdempotentMessage(senderId: string, clientMessageId: string): Promise<{
    requestFingerprint: string;
    conversation: DirectConversation;
    message: StoredMessage;
  } | null>;
  /** Creates a pair-unique conversation and first message plus change/outbox work in one transaction. */
  createConversationWithMessage(input: {
    conversationId: string;
    initiatorId: string;
    recipientId: string;
    requestState: "pending" | "active";
    messageId: string;
    clientMessageId: string;
    requestFingerprint: string;
    text: string;
    createdAt: Date;
  }): Promise<{ conversation: DirectConversation; message: StoredMessage }>;
  /** Activates an existing request after a current friendship is observed under the pair lock. */
  activateConversation(conversation: DirectConversation, now: Date): Promise<DirectConversation>;
  /** Existing active threads accept a distinct message through this same pair-locked transaction. */
  appendExistingMessage(input: {
    conversation: DirectConversation;
    senderId: string;
    clientMessageId: string;
    requestFingerprint: string;
    text: string;
    createdAt: Date;
    messageId: string;
  }): Promise<StoredMessage>;
}

export interface DirectConversationStore {
  withDirectTransaction<T>(
    actorId: string,
    recipientId: string,
    action: (transaction: DirectConversationTransaction) => Promise<T>,
  ): Promise<T>;
}

export interface ConversationReader {
  unread(actorId: string): Promise<{ inboxCount: number; requestCount: number }>;
  resolve(actorId: string, conversationId: string, decision: "accept" | "decline"): Promise<unknown>;
  markRead(
    actorId: string,
    conversationId: string,
    throughSequence: string,
  ): Promise<{ lastReadSequence: string; receiptSequence: string; unreadCount: number }>;
  changes(actorId: string, conversationId: string, after: string | undefined, limit: number): Promise<unknown>;
}