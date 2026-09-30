import { createHyperdriveDatabase, schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { and, eq } from "drizzle-orm";
import { withLockedConversationMessageTransaction } from "../shared/conversation-message-transaction";
import { appendPeerChange, findMessage, getAccess, type MessageWriteQueryable } from "../shared/message-write-primitives";
import type { ConversationAccess, StoredMessage } from "../../shared/messaging-types";

export interface RemoveReactionTransaction {
  getAccess(actorId: string, conversationId: string): Promise<ConversationAccess>;
  findMessage(conversationId: string, messageId: string): Promise<StoredMessage | null>;
  removeReaction(messageId: string, actorId: string): Promise<StoredMessage>;
  appendPeerChange(input: { conversationId: string; messageId: string | null; kind: "reaction.changed" }): Promise<void>;
}

export interface RemoveReactionStore {
  withConversationTransaction<T>(
    actorId: string,
    conversationId: string,
    operation: (transaction: RemoveReactionTransaction) => Promise<T>,
  ): Promise<T>;
}

class PostgresRemoveReactionTransaction implements RemoveReactionTransaction {
  constructor(private readonly queryable: MessageWriteQueryable, private readonly actorId: string, private readonly conversationId: string) {}

  async getAccess(actorId: string, conversationId: string): Promise<ConversationAccess> {
    return getAccess(this.queryable, actorId, conversationId);
  }

  async findMessage(conversationId: string, messageId: string): Promise<StoredMessage | null> {
    return findMessage(this.queryable, this.actorId, conversationId, messageId);
  }

  async removeReaction(messageId: string, actorId: string): Promise<StoredMessage> {
    await this.queryable
      .delete(schema.messageReactions)
      .where(and(
        eq(schema.messageReactions.messageId, messageId),
        eq(schema.messageReactions.participantId, actorId),
      ));
    const current = await this.findMessage(this.conversationId, messageId);
    if (!current) throw new Error("Message disappeared during reaction.");
    return current;
  }

  async appendPeerChange(input: { conversationId: string; messageId: string | null; kind: "reaction.changed" }): Promise<void> {
    return appendPeerChange(this.queryable, input);
  }
}

export function createPostgresRemoveReactionStore(database: DayliDatabase): RemoveReactionStore {
  return {
    withConversationTransaction: (actorId, conversationId, operation) =>
      database.transaction((transaction) =>
        withLockedConversationMessageTransaction(transaction, conversationId, (lockedTransaction) =>
          operation(new PostgresRemoveReactionTransaction(lockedTransaction, actorId, conversationId)))),
  };
}

export function createHyperdriveRemoveReactionStore(hyperdrive: HyperdriveBinding): RemoveReactionStore {
  return {
    async withConversationTransaction(actorId, conversationId, operation) {
      const database = createHyperdriveDatabase(hyperdrive);
      try {
        return await database.db.transaction((transaction) =>
          withLockedConversationMessageTransaction(transaction, conversationId, (lockedTransaction) =>
            operation(new PostgresRemoveReactionTransaction(lockedTransaction, actorId, conversationId))));
      } finally {
        await database.close();
      }
    },
  };
}
