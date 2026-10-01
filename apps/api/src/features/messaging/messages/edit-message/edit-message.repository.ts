import { createHyperdriveDatabase, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { withLockedConversationMessageTransaction } from "../shared/conversation-message-transaction";
import { appendPeerChange, findMessage, getAccess, type MessageWriteQueryable } from "../shared/message-write-primitives";
import { updateMessageRow } from "../shared/update-message-row";
import type { ConversationAccess, StoredMessage } from "../../shared/messaging-types";

export interface EditMessageTransaction {
  getAccess(actorId: string, conversationId: string): Promise<ConversationAccess>;
  findMessage(conversationId: string, messageId: string): Promise<StoredMessage | null>;
  editMessage(input: { messageId: string; body: string; editedAt: Date; expectedVersion: number }): Promise<StoredMessage>;
  appendPeerChange(input: { conversationId: string; messageId: string; actorId?: string; kind: "message.edited" }): Promise<void>;
}

export interface EditMessageStore {
  withConversationTransaction<T>(
    actorId: string,
    conversationId: string,
    operation: (transaction: EditMessageTransaction) => Promise<T>,
  ): Promise<T>;
}

class PostgresEditMessageTransaction implements EditMessageTransaction {
  constructor(private readonly queryable: MessageWriteQueryable, private readonly actorId: string) {}

  async getAccess(actorId: string, conversationId: string): Promise<ConversationAccess> {
    return getAccess(this.queryable, actorId, conversationId);
  }

  async findMessage(conversationId: string, messageId: string): Promise<StoredMessage | null> {
    return findMessage(this.queryable, this.actorId, conversationId, messageId);
  }

  async editMessage(input: { messageId: string; body: string; editedAt: Date; expectedVersion: number }): Promise<StoredMessage> {
    return updateMessageRow(this.queryable, input);
  }

  async appendPeerChange(input: { conversationId: string; messageId: string; actorId?: string; kind: "message.edited" }): Promise<void> {
    return appendPeerChange(this.queryable, input);
  }
}

export function createPostgresEditMessageStore(database: DayliDatabase): EditMessageStore {
  return {
    withConversationTransaction: (actorId, conversationId, operation) =>
      database.transaction((transaction) =>
        withLockedConversationMessageTransaction(transaction, conversationId, (lockedTransaction) =>
          operation(new PostgresEditMessageTransaction(lockedTransaction, actorId)))),
  };
}

export function createHyperdriveEditMessageStore(hyperdrive: HyperdriveBinding): EditMessageStore {
  return {
    async withConversationTransaction(actorId, conversationId, operation) {
      const database = createHyperdriveDatabase(hyperdrive);
      try {
        return await database.db.transaction((transaction) =>
          withLockedConversationMessageTransaction(transaction, conversationId, (lockedTransaction) =>
            operation(new PostgresEditMessageTransaction(lockedTransaction, actorId))));
      } finally {
        await database.close();
      }
    },
  };
}
