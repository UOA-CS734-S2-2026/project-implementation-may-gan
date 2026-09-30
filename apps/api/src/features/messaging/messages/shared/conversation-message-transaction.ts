import { lockRelationshipPair, sql, type DayliDatabase, type RelationshipPairLockTransaction } from "@dayli/db";

type ConversationMessageTransaction = Pick<DayliDatabase, "execute">;
type RelationshipPair = { participant_low_id: string; participant_high_id: string };

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
    select participant_low_id, participant_high_id from public.conversations where id = ${conversationId}
  `));
  if (pair) await lockRelationshipPair(transaction as unknown as RelationshipPairLockTransaction, pair.participant_low_id, pair.participant_high_id);
  return operation(transaction);
}
