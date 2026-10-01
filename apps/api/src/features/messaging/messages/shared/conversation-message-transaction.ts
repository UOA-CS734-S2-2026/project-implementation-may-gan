import { lockRelationshipPair, schema, type DayliDatabase } from "@dayli/db";
import { asc, eq, inArray } from "drizzle-orm";

type ConversationMessageTransaction = Pick<DayliDatabase, "delete" | "insert" | "select" | "update">;

/**
 * Runs a message-write operation after canonical user-row locks and the direct
 * conversation's relationship-pair lock. Lifecycle changes take the same user
 * rows first, so later access reads observe a fresh post-lock state.
 */
export async function withLockedConversationMessageTransaction<T>(
  transaction: ConversationMessageTransaction,
  conversationId: string,
  operation: (transaction: ConversationMessageTransaction) => Promise<T>,
): Promise<T> {
  const [pair] = await transaction
    .select({ userLowId: schema.conversations.userLowId, userHighId: schema.conversations.userHighId })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conversationId))
    .limit(1);
  if (pair) {
    await transaction
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(inArray(schema.user.id, [pair.userLowId, pair.userHighId]))
      .orderBy(asc(schema.user.id))
      .for("update");
    await lockRelationshipPair(transaction, pair.userLowId, pair.userHighId);
  }
  return operation(transaction);
}
