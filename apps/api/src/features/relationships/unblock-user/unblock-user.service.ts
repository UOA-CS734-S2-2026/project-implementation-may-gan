import {
  assertDifferentRelationshipUsers,
  inRelationshipTransaction,
  relationshipTimestamp,
  toCleanupRelationshipStatus,
  type RelationshipOperationDependencies,
  type RelationshipStatus,
} from "../shared/relationship-service";

export async function unblockUser(dependencies: RelationshipOperationDependencies, actorId: string, subjectId: string): Promise<RelationshipStatus> {
  assertDifferentRelationshipUsers(actorId, subjectId);
  const snapshot = await inRelationshipTransaction(dependencies, (transaction) => transaction.unblock({
    actorId,
    subjectId,
    unblockedAt: relationshipTimestamp(dependencies),
  }));
  return toCleanupRelationshipStatus(snapshot);
}
