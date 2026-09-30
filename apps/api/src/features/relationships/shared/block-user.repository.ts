import { schema } from "@dayli/db";
import { and, eq, or } from "drizzle-orm";
import type { StoredRelationshipSnapshot } from "./relationship-service";
import type { RelationshipPostgresContext } from "./relationship-postgres";

export async function blockRelationshipPair(context: RelationshipPostgresContext, input: { blockerId: string; blockedId: string; blockedAt: string }): Promise<StoredRelationshipSnapshot> {
  await context.lockPair(input.blockerId, input.blockedId);
  await context.requireTarget(input.blockerId, input.blockedId);
  const blockedAt = new Date(input.blockedAt);
  const requestPair = or(
    and(eq(schema.friendRequests.senderId, input.blockerId), eq(schema.friendRequests.recipientId, input.blockedId)),
    and(eq(schema.friendRequests.senderId, input.blockedId), eq(schema.friendRequests.recipientId, input.blockerId)),
  );
  const friendshipPair = or(
    and(eq(schema.friendships.userId, input.blockerId), eq(schema.friendships.friendId, input.blockedId)),
    and(eq(schema.friendships.userId, input.blockedId), eq(schema.friendships.friendId, input.blockerId)),
  );
  await context.queryable
    .update(schema.friendRequests)
    .set({ status: "cancelled", resolvedAt: blockedAt })
    .where(and(eq(schema.friendRequests.status, "pending"), requestPair));
  await context.queryable
    .update(schema.friendships)
    .set({ state: "ended", stateChangedAt: blockedAt })
    .where(friendshipPair);
  await context.queryable
    .insert(schema.relationshipBlocks)
    .values({ blockerId: input.blockerId, blockedId: input.blockedId, blockedAt, unblockedAt: null })
    .onConflictDoUpdate({
      target: [schema.relationshipBlocks.blockerId, schema.relationshipBlocks.blockedId],
      set: { blockedAt, unblockedAt: null },
    });
  return context.snapshot(input.blockerId, input.blockedId);
}
