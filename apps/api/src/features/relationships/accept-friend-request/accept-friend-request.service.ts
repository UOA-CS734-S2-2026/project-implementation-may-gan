import {
  inRelationshipTransaction,
  relationshipTimestamp,
  toRelationshipStatus,
  type RelationshipOperationDependencies,
  type RelationshipStatus,
} from "../shared/relationship-service";

export async function acceptFriendRequest(dependencies: RelationshipOperationDependencies, actorId: string, requestId: string): Promise<RelationshipStatus> {
  const snapshot = await inRelationshipTransaction(dependencies, (transaction) => transaction.acceptRequest({
    requestId,
    recipientId: actorId,
    acceptedAt: relationshipTimestamp(dependencies),
  }));
  return toRelationshipStatus(snapshot);
}
