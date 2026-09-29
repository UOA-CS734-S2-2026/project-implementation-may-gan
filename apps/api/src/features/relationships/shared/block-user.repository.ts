import type { StoredRelationshipSnapshot } from "./relationship-service";
import { sql, type RelationshipPostgresContext } from "./relationship-postgres";

export async function blockRelationshipPair(context: RelationshipPostgresContext, input: { blockerId: string; blockedId: string; blockedAt: string }): Promise<StoredRelationshipSnapshot> {
  await context.lockPair(input.blockerId, input.blockedId);
  await context.requireTarget(input.blockerId, input.blockedId);
  await context.queryable.execute(sql`update public.friend_requests set status = 'cancelled', resolved_at = ${input.blockedAt}::timestamptz where status = 'pending' and ((sender_id = ${input.blockerId} and recipient_id = ${input.blockedId}) or (sender_id = ${input.blockedId} and recipient_id = ${input.blockerId}))`);
  await context.queryable.execute(sql`update public.friendships set state = 'ended', state_changed_at = ${input.blockedAt}::timestamptz where (user_id = ${input.blockerId} and friend_id = ${input.blockedId}) or (user_id = ${input.blockedId} and friend_id = ${input.blockerId})`);
  await context.queryable.execute(sql`insert into public.relationship_blocks (blocker_id, blocked_id, blocked_at, unblocked_at) values (${input.blockerId}, ${input.blockedId}, ${input.blockedAt}::timestamptz, null) on conflict (blocker_id, blocked_id) do update set blocked_at = excluded.blocked_at, unblocked_at = null`);
  return context.snapshot(input.blockerId, input.blockedId);
}
