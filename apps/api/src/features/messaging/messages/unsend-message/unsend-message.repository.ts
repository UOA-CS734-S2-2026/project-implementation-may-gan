import { createHyperdriveDatabase, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { withLockedConversationMessageTransaction } from "../shared/conversation-message-transaction";
import { appendPeerChange, findMessage, getAccess, type MessageWriteQueryable } from "../shared/message-write-primitives";
import { updateMessageRow } from "../shared/update-message-row";
import type { ConversationAccess, StoredMessage } from "../../shared/messaging-types";

export interface UnsendMessageTransaction {
  getAccess(actorId: string, conversationId: string): Promise<ConversationAccess>;
  findMessage(conversationId: string, messageId: string): Promise<StoredMessage | null>;
  unsendMessage(input: { messageId: string; unsentAt: Date }): Promise<StoredMessage>;
  appendPeerChange(input: { conversationId: string; messageId: string; actorId?: string; kind: "message.unsent" }): Promise<void>;
}

export interface UnsendMessageStore {
  withConversationTransaction<T>(
    actorId: string,
    conversationId: string,
    operation: (transaction: UnsendMessageTransaction) => Promise<T>,
  ): Promise<T>;
}

class PostgresUnsendMessageTransaction implements UnsendMessageTransaction {
  constructor(private readonly queryable: MessageWriteQueryable, private readonly actorId: string) {}

  async getAccess(actorId: string, conversationId: string): Promise<ConversationAccess> {
    return getAccess(this.queryable, actorId, conversationId);
  }

  async findMessage(conversationId: string, messageId: string): Promise<StoredMessage | null> {
    return findMessage(this.queryable, this.actorId, conversationId, messageId);
  }

  async unsendMessage(input: { messageId: string; unsentAt: Date }): Promise<StoredMessage> {
    return updateMessageRow(this.queryable, { messageId: input.messageId, body: null, unsentAt: input.unsentAt });
  }

  async appendPeerChange(input: { conversationId: string; messageId: string; actorId?: string; kind: "message.unsent" }): Promise<void> {
    return appendPeerChange(this.queryable, input);
  }
}

export function createPostgresUnsendMessageStore(database: DayliDatabase): UnsendMessageStore {
  return {
    withConversationTransaction: (actorId, conversationId, operation) =>
      database.transaction((transaction) =>
        withLockedConversationMessageTransaction(transaction, conversationId, (lockedTransaction) =>
          operation(new PostgresUnsendMessageTransaction(lockedTransaction, actorId)))),
  };
}

export function createHyperdriveUnsendMessageStore(hyperdrive: HyperdriveBinding): UnsendMessageStore {
  return {
    async withConversationTransaction(actorId, conversationId, operation) {
      const database = createHyperdriveDatabase(hyperdrive);
      try {
        return await database.db.transaction((transaction) =>
          withLockedConversationMessageTransaction(transaction, conversationId, (lockedTransaction) =>
            operation(new PostgresUnsendMessageTransaction(lockedTransaction, actorId))));
      } finally {
        await database.close();
      }
    },
  };
}
