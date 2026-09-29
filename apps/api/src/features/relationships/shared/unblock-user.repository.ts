import type { StoredRelationshipSnapshot } from "./relationship-service";
import { sql, type RelationshipPostgresContext } from "./relationship-postgres";

export async function unblockRelationshipPair(context: RelationshipPostgresContext, input: { actorId: string; subjectId: string; unblockedAt: string }): Promise<StoredRelationshipSnapshot> {
  await context.lockPair(input.actorId, input.subjectId);
  await context.requireTarget(input.actorId, input.subjectId);
  await context.queryable.execute(sql`update public.relationship_blocks set unblocked_at = ${input.unblockedAt}::timestamptz where blocker_id = ${input.actorId} and blocked_id = ${input.subjectId} and unblocked_at is null`);
  return context.snapshot(input.actorId, input.subjectId);
}
