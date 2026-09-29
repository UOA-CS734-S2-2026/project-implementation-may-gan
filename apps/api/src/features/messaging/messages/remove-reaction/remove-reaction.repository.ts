import { sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { withHyperdriveConversationMessageTransaction, withPostgresConversationMessageTransaction } from "../shared/conversation-message-transaction";
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
    await this.queryable.execute(sql`delete from public.message_reactions where message_id = ${messageId} and user_id = ${actorId}`);
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
      withPostgresConversationMessageTransaction(database, conversationId, (transaction) =>
        operation(new PostgresRemoveReactionTransaction(transaction, actorId, conversationId))),
  };
}

export function createHyperdriveRemoveReactionStore(hyperdrive: HyperdriveBinding): RemoveReactionStore {
  return {
    withConversationTransaction: (actorId, conversationId, operation) =>
      withHyperdriveConversationMessageTransaction(hyperdrive, conversationId, (transaction) =>
        operation(new PostgresRemoveReactionTransaction(transaction, actorId, conversationId))),
  };
}
