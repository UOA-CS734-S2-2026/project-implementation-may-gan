import { schema } from "@dayli/db";
import { and, eq, or } from "drizzle-orm";
import type { StoredRelationshipSnapshot } from "./relationship-service";
import type { RelationshipPostgresContext } from "./relationship-postgres";

export async function endFriendshipRows(context: RelationshipPostgresContext, input: { actorId: string; subjectId: string; endedAt: string }): Promise<StoredRelationshipSnapshot> {
  await context.lockPair(input.actorId, input.subjectId);
  await context.requireTarget(input.actorId, input.subjectId);
  await context.queryable
    .update(schema.friendships)
    .set({ state: "ended", stateChangedAt: new Date(input.endedAt) })
    .where(or(
      and(eq(schema.friendships.userId, input.actorId), eq(schema.friendships.friendId, input.subjectId)),
      and(eq(schema.friendships.userId, input.subjectId), eq(schema.friendships.friendId, input.actorId)),
    ));
  return context.snapshot(input.actorId, input.subjectId);
}
