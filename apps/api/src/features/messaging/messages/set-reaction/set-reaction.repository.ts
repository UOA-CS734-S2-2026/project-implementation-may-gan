import { createHyperdriveDatabase, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { withLockedConversationMessageTransaction } from "../shared/conversation-message-transaction";
import { appendPeerChange, findMessage, getAccess, type MessageWriteQueryable } from "../shared/message-write-primitives";
import type { ConversationAccess, ReactionKey, StoredMessage } from "../../shared/messaging-types";

type Row = Record<string, unknown>;
const rows = <T extends Row>(value: unknown) => [...value as Iterable<T>];

export interface SetReactionTransaction {
  getAccess(actorId: string, conversationId: string): Promise<ConversationAccess>;
  findMessage(conversationId: string, messageId: string): Promise<StoredMessage | null>;
  setReaction(messageId: string, actorId: string, reaction: ReactionKey): Promise<StoredMessage>;
  appendPeerChange(input: { conversationId: string; messageId: string | null; kind: "reaction.changed" }): Promise<void>;
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
    await this.queryable.execute(sql`insert into public.message_reactions (message_id, user_id, reaction, created_at) values (${messageId}, ${actorId}, ${reaction}, now()) on conflict (message_id, user_id) do update set reaction = excluded.reaction, created_at = excluded.created_at`);
    const current = await this.findMessage(this.conversationId, messageId);
    if (!current) throw new Error("Message disappeared during reaction.");
    const result = rows<{ reaction: string; count: number | string; reacted: boolean }>(await this.queryable.execute(sql`select reaction, count(*)::int as count, bool_or(user_id = ${actorId}) as reacted from public.message_reactions where message_id = ${messageId} group by reaction`));
    current.reactions = result.map((row) => ({ reaction: row.reaction as ReactionKey, count: Number(row.count), reactedByActor: row.reacted }));
    return current;
  }

  async appendPeerChange(input: { conversationId: string; messageId: string | null; kind: "reaction.changed" }): Promise<void> {
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
