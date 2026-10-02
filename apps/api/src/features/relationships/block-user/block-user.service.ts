import {
  assertDifferentRelationshipUsers,
  inRelationshipTransaction,
  relationshipTimestamp,
  toCleanupRelationshipStatus,
  type RelationshipOperationDependencies,
  type RelationshipStatus,
} from "../shared/relationship-service";

export async function blockUser(dependencies: RelationshipOperationDependencies, actorId: string, subjectId: string): Promise<RelationshipStatus> {
  assertDifferentRelationshipUsers(actorId, subjectId);
  const snapshot = await inRelationshipTransaction(dependencies, (transaction) => transaction.block({
    blockerId: actorId,
    blockedId: subjectId,
    blockedAt: relationshipTimestamp(dependencies),
  }));
  return toCleanupRelationshipStatus(snapshot);
}
