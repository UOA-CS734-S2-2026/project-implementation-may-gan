import { schema } from "@dayli/db";
import type { StoredRelationshipSnapshot } from "./relationship-service";
import type { RelationshipPostgresContext } from "./relationship-postgres";

export async function acceptFriendRequestRow(context: RelationshipPostgresContext, input: { requestId: string; recipientId: string; acceptedAt: string }): Promise<StoredRelationshipSnapshot> {
  const { other } = await context.finishRequest(input.requestId, "recipient_id", input.recipientId, "accepted", input.acceptedAt);
  const acceptedAt = new Date(input.acceptedAt);
  await context.queryable
    .insert(schema.friendships)
    .values([
      { userId: input.recipientId, friendId: other, state: "active", stateChangedAt: acceptedAt },
      { userId: other, friendId: input.recipientId, state: "active", stateChangedAt: acceptedAt },
    ])
    .onConflictDoUpdate({
      target: [schema.friendships.userId, schema.friendships.friendId],
      set: { state: "active", stateChangedAt: acceptedAt },
    });
  return context.snapshot(input.recipientId, other);
}
