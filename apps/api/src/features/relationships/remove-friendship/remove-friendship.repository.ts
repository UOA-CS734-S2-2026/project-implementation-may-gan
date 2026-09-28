import type { StoredRelationshipSnapshot } from "../shared/relationship-service";
import { sql, type RelationshipPostgresContext } from "../shared/relationship-postgres";

export async function endFriendshipRows(context: RelationshipPostgresContext, input: { actorId: string; subjectId: string; endedAt: string }): Promise<StoredRelationshipSnapshot> {
  await context.lockPair(input.actorId, input.subjectId);
  await context.requireTarget(input.actorId, input.subjectId);
  await context.queryable.execute(sql`update public.friendships set state = 'ended', state_changed_at = ${input.endedAt}::timestamptz where (user_id = ${input.actorId} and friend_id = ${input.subjectId}) or (user_id = ${input.subjectId} and friend_id = ${input.actorId})`);
  return context.snapshot(input.actorId, input.subjectId);
}
