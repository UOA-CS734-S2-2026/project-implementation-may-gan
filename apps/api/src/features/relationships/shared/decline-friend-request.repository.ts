import type { StoredRelationshipSnapshot } from "./relationship-service";
import type { RelationshipPostgresContext } from "./relationship-postgres";

export async function declineFriendRequestRow(context: RelationshipPostgresContext, input: { requestId: string; recipientId: string; declinedAt: string }): Promise<StoredRelationshipSnapshot> {
  const { other } = await context.finishRequest(input.requestId, "recipient_id", input.recipientId, "declined", input.declinedAt);
  return context.snapshot(input.recipientId, other);
}
