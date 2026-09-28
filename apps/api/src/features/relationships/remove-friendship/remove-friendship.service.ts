import {
  assertDifferentRelationshipUsers,
  inRelationshipTransaction,
  relationshipTimestamp,
  toRelationshipStatus,
  type RelationshipOperationDependencies,
  type RelationshipStatus,
} from "../shared/relationship-service";

export async function removeFriendship(dependencies: RelationshipOperationDependencies, actorId: string, subjectId: string): Promise<RelationshipStatus> {
  assertDifferentRelationshipUsers(actorId, subjectId);
  const snapshot = await inRelationshipTransaction(dependencies, (transaction) => transaction.removeFriendship({
    actorId,
    subjectId,
    endedAt: relationshipTimestamp(dependencies),
  }));
  return toRelationshipStatus(snapshot);
}
