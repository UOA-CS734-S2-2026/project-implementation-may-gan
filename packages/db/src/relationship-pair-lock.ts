import { sql } from "drizzle-orm";

/** The minimum transaction capability needed for the pair advisory lock. */
export interface RelationshipPairLockTransaction {
  execute(query: ReturnType<typeof sql>): Promise<unknown>;
}

function relationshipPairKey(leftUserId: string, rightUserId: string): string {
  return [leftUserId, rightUserId]
    .sort()
    .map((value) => `${value.length}:${value}`)
    .join(":");
}

/**
 * Serialize relationship mutations for one unordered user pair in the caller's
 * transaction. The encoding and hash seed are compatibility-critical.
 */
export async function lockRelationshipPair(
  transaction: RelationshipPairLockTransaction,
  leftUserId: string,
  rightUserId: string,
): Promise<void> {
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${relationshipPairKey(leftUserId, rightUserId)}, 734))`,
  );
}
