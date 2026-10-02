import {
  inRelationshipTransaction,
  relationshipTimestamp,
  toCleanupRelationshipStatus,
  type RelationshipOperationDependencies,
  type RelationshipStatus,
} from "../shared/relationship-service";

export async function cancelFriendRequest(dependencies: RelationshipOperationDependencies, actorId: string, requestId: string): Promise<RelationshipStatus> {
  const snapshot = await inRelationshipTransaction(dependencies, (transaction) => transaction.cancelRequest({
    requestId,
    senderId: actorId,
    cancelledAt: relationshipTimestamp(dependencies),
  }));
  return toCleanupRelationshipStatus(snapshot);
}
