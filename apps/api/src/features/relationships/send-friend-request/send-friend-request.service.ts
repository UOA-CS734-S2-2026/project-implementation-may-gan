import {
  assertDifferentRelationshipUsers,
  inRelationshipTransaction,
  relationshipTimestamp,
  toRelationshipStatus,
  type RelationshipOperationDependencies,
  type RelationshipStatus,
} from "../shared/relationship-service";

export async function sendFriendRequest(
  dependencies: RelationshipOperationDependencies,
  actorId: string,
  recipientId: string,
): Promise<RelationshipStatus> {
  assertDifferentRelationshipUsers(actorId, recipientId);
  const snapshot = await inRelationshipTransaction(dependencies, (transaction) => transaction.sendRequest({
    senderId: actorId,
    recipientId,
    createdAt: relationshipTimestamp(dependencies),
  }));
  return toRelationshipStatus(snapshot);
}
