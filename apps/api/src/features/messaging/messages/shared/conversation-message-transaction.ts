import { lockRelationshipPair, schema, type DayliDatabase } from "@dayli/db";
import { asc, eq, inArray } from "drizzle-orm";

type ConversationMessageTransaction = Pick<DayliDatabase, "delete" | "insert" | "select" | "update">;

/**
 * Runs a message-write operation in the caller-owned transaction after it has
 * acquired the direct conversation's relationship-pair lock and both active
 * user rows. Lifecycle transitions lock the same user row before they become
 * pending, so availability cannot be observed before such a transition and a
 * positive write committed after it.
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
  if (pair) {
    await lockRelationshipPair(transaction, pair.participantLowId, pair.participantHighId);
    // Conversation participant IDs initially equal user IDs. A deleted stable
    // participant deliberately has no user row, which getAccess treats as
    // unavailable while preserving readable retained history.
    await transaction
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(inArray(schema.user.id, [pair.participantLowId, pair.participantHighId]))
      .orderBy(asc(schema.user.id))
      .for("update");
  }
  return operation(transaction);
}
