import type { StoredRelationshipSnapshot } from "../shared/relationship-service";
import type { RelationshipPostgresContext } from "../shared/relationship-postgres";

export async function cancelFriendRequestRow(context: RelationshipPostgresContext, input: { requestId: string; senderId: string; cancelledAt: string }): Promise<StoredRelationshipSnapshot> {
  const { other } = await context.finishRequest(input.requestId, "sender_id", input.senderId, "cancelled", input.cancelledAt);
  return context.snapshot(input.senderId, other);
}
