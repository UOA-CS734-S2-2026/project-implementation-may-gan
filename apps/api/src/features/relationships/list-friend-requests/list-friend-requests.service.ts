import {
  inRelationshipTransaction,
  type PendingRequestDirection,
  type PendingRequestPage,
  type RelationshipOperationDependencies,
} from "../shared/relationship-service";

export function listFriendRequests(
  dependencies: RelationshipOperationDependencies,
  actorId: string,
  direction: PendingRequestDirection,
  limit: number,
  cursor?: string,
): Promise<PendingRequestPage> {
  return inRelationshipTransaction(dependencies, (transaction) => (
    transaction.listPendingRequests(actorId, direction, limit, cursor)
  ));
}
