import { inRelationshipTransaction, relationshipTimestamp, type RelationshipOperationDependencies, type RelationshipUserPage } from "../shared/relationship-service";

export function searchUsers(
  dependencies: RelationshipOperationDependencies,
  actorId: string,
  query: string,
  limit: number,
  cursor?: string,
): Promise<RelationshipUserPage> {
  return inRelationshipTransaction(dependencies, (transaction) => (
    transaction.searchUsers(actorId, query.toLocaleLowerCase(), limit, relationshipTimestamp(dependencies), cursor)
  ));
}
