import { lockRelationshipPair, schema, type DayliDatabase } from "@dayli/db";
import { eq } from "drizzle-orm";

type ConversationMessageTransaction = Pick<DayliDatabase, "delete" | "insert" | "select" | "update">;

/**
 * Runs a message-write operation in the caller-owned transaction after it has
 * acquired the direct conversation's relationship-pair lock.
 */
export async function withLockedConversationMessageTransaction<T>(
  transaction: ConversationMessageTransaction,
  conversationId: string,
  operation: (transaction: ConversationMessageTransaction) => Promise<T>,
): Promise<T> {
  const [pair] = await transaction
    .select({ participantLowId: schema.conversations.participantLowId, participantHighId: schema.conversations.participantHighId })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conversationId))
    .limit(1);
  if (pair) await lockRelationshipPair(transaction, pair.participantLowId, pair.participantHighId);
  return operation(transaction);
}
