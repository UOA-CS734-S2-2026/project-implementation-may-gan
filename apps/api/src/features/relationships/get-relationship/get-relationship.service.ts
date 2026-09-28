import {
  assertDifferentRelationshipUsers,
  inRelationshipTransaction,
  toRelationshipStatus,
  type RelationshipOperationDependencies,
  type RelationshipStatus,
} from "../shared/relationship-service";

export async function getRelationship(
  dependencies: RelationshipOperationDependencies,
  actorId: string,
  subjectId: string,
): Promise<RelationshipStatus> {
  assertDifferentRelationshipUsers(actorId, subjectId);
  return toRelationshipStatus(
    await inRelationshipTransaction(dependencies, (transaction) => transaction.getSnapshot(actorId, subjectId)),
    { concealBlocked: true },
  );
}
