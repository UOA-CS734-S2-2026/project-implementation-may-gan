import { type DayliDatabase } from "@dayli/db";
import { lockActiveConversationParticipants } from "../../shared/conversation-participants";

type ConversationMessageTransaction = Pick<DayliDatabase, "delete" | "insert" | "select" | "update">;

/**
 * Runs a message-write operation after canonical locks for the conversation's
 * current participant mappings and its active relationship pair. Lifecycle
 * changes take the same user rows first, and the mapping is reread after lock.
 */
export async function withLockedConversationMessageTransaction<T>(
  transaction: ConversationMessageTransaction,
  conversationId: string,
  operation: (transaction: ConversationMessageTransaction) => Promise<T>,
): Promise<T> {
  await lockActiveConversationParticipants(transaction, conversationId);
  return operation(transaction);
}
