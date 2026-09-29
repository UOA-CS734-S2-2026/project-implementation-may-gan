import {
  inRelationshipTransaction,
  RelationshipServiceError,
  type RelationshipOperationDependencies,
  type RelationshipUserCard,
} from "../shared/relationship-service";

/** Return only a chosen public identity and the viewer's relationship state. */
export async function getProfileByUsername(
  dependencies: RelationshipOperationDependencies,
  actorId: string,
  username: string,
): Promise<RelationshipUserCard> {
  const profile = await inRelationshipTransaction(dependencies, (transaction) =>
    transaction.findProfileByUsername(actorId, username),
  );
  if (!profile) throw new RelationshipServiceError("NOT_FOUND", "The requested profile was not found.");
  return profile;
}
