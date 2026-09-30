import { lockRelationshipPair, sql, type DayliDatabase } from "@dayli/db";

type ConversationMessageTransaction = Pick<DayliDatabase, "delete" | "execute" | "insert" | "select" | "update">;
type RelationshipPair = { user_low_id: string; user_high_id: string };

const rows = <T>(value: unknown) => [...value as Iterable<T>];

/**
 * Runs a message-write operation in the caller-owned transaction after it has
 * acquired the direct conversation's relationship-pair lock.
 */
export async function withLockedConversationMessageTransaction<T>(
  transaction: ConversationMessageTransaction,
  conversationId: string,
  operation: (transaction: ConversationMessageTransaction) => Promise<T>,
): Promise<T> {
  const [pair] = rows<RelationshipPair>(await transaction.execute(sql`
    select user_low_id, user_high_id from public.conversations where id = ${conversationId}
  `));
  if (pair) await lockRelationshipPair(transaction, pair.user_low_id, pair.user_high_id);
  return operation(transaction);
}
