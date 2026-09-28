import {
  inRelationshipTransaction,
  relationshipTimestamp,
  toRelationshipStatus,
  type RelationshipOperationDependencies,
  type RelationshipStatus,
} from "../shared/relationship-service";

export async function declineFriendRequest(dependencies: RelationshipOperationDependencies, actorId: string, requestId: string): Promise<RelationshipStatus> {
  const snapshot = await inRelationshipTransaction(dependencies, (transaction) => transaction.declineRequest({
    requestId,
    recipientId: actorId,
    declinedAt: relationshipTimestamp(dependencies),
  }));
  return toRelationshipStatus(snapshot);
}
