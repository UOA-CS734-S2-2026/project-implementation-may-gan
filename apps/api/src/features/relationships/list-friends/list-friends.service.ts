import { inRelationshipTransaction, type RelationshipOperationDependencies, type RelationshipUserPage } from "../shared/relationship-service";

export function listFriends(
  dependencies: RelationshipOperationDependencies,
  actorId: string,
  limit: number,
  cursor?: string,
): Promise<RelationshipUserPage> {
  return inRelationshipTransaction(dependencies, (transaction) => transaction.listFriends(actorId, limit, cursor));
}
