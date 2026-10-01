import { createHyperdriveDatabase, schema, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { withLockedConversationMessageTransaction } from "../shared/conversation-message-transaction";
import { appendPeerChange, findMessage, getAccess, type MessageWriteQueryable } from "../shared/message-write-primitives";
import { loadReactionSummaries } from "../../shared/message-projection";
import type { ConversationAccess, ReactionKey, StoredMessage } from "../../shared/messaging-types";

export interface SetReactionTransaction {
  getAccess(actorId: string, conversationId: string): Promise<ConversationAccess>;
  findMessage(conversationId: string, messageId: string): Promise<StoredMessage | null>;
  setReaction(messageId: string, actorId: string, reaction: ReactionKey): Promise<StoredMessage>;
  appendPeerChange(input: { conversationId: string; messageId: string | null; actorId?: string; kind: "reaction.changed" }): Promise<void>;
}

export interface SetReactionStore {
  withConversationTransaction<T>(
    actorId: string,
    conversationId: string,
    operation: (transaction: SetReactionTransaction) => Promise<T>,
  ): Promise<T>;
}

class PostgresSetReactionTransaction implements SetReactionTransaction {
  constructor(private readonly queryable: MessageWriteQueryable, private readonly actorId: string, private readonly conversationId: string) {}

  async getAccess(actorId: string, conversationId: string): Promise<ConversationAccess> {
    return getAccess(this.queryable, actorId, conversationId);
  }

  async findMessage(conversationId: string, messageId: string): Promise<StoredMessage | null> {
    return findMessage(this.queryable, this.actorId, conversationId, messageId);
  }

  async setReaction(messageId: string, actorId: string, reaction: ReactionKey): Promise<StoredMessage> {
    await this.queryable
      .insert(schema.messageReactions)
      .values({ messageId, userId: actorId, reaction, createdAt: sql`now()` })
      .onConflictDoUpdate({
        target: [schema.messageReactions.messageId, schema.messageReactions.userId],
        set: { reaction, createdAt: sql`now()` },
      });
    const current = await this.findMessage(this.conversationId, messageId);
    if (!current) throw new Error("Message disappeared during reaction.");
    current.reactions = await loadReactionSummaries(this.queryable, messageId, actorId);
    return current;
  }

  async appendPeerChange(input: { conversationId: string; messageId: string | null; actorId?: string; kind: "reaction.changed" }): Promise<void> {
    return appendPeerChange(this.queryable, input);
  }
}

export function createPostgresSetReactionStore(database: DayliDatabase): SetReactionStore {
  return {
    withConversationTransaction: (actorId, conversationId, operation) =>
      database.transaction((transaction) =>
        withLockedConversationMessageTransaction(transaction, conversationId, (lockedTransaction) =>
          operation(new PostgresSetReactionTransaction(lockedTransaction, actorId, conversationId)))),
  };
}

export function createHyperdriveSetReactionStore(hyperdrive: HyperdriveBinding): SetReactionStore {
  return {
    async withConversationTransaction(actorId, conversationId, operation) {
      const database = createHyperdriveDatabase(hyperdrive);
      try {
        return await database.db.transaction((transaction) =>
          withLockedConversationMessageTransaction(transaction, conversationId, (lockedTransaction) =>
            operation(new PostgresSetReactionTransaction(lockedTransaction, actorId, conversationId))));
      } finally {
        await database.close();
      }
    },
  };
}
