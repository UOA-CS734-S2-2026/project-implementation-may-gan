import type { StoredRelationshipSnapshot } from "./relationship-service";
import { sql, type RelationshipPostgresContext } from "./relationship-postgres";

export async function acceptFriendRequestRow(context: RelationshipPostgresContext, input: { requestId: string; recipientId: string; acceptedAt: string }): Promise<StoredRelationshipSnapshot> {
  const { other } = await context.finishRequest(input.requestId, "recipient_id", input.recipientId, "accepted", input.acceptedAt);
  await context.queryable.execute(sql`
    insert into public.friendships (user_id, friend_id, state, state_changed_at)
    values (${input.recipientId}, ${other}, 'active', ${input.acceptedAt}::timestamptz), (${other}, ${input.recipientId}, 'active', ${input.acceptedAt}::timestamptz)
    on conflict (user_id, friend_id) do update set state = 'active', state_changed_at = excluded.state_changed_at
  `);
  return context.snapshot(input.recipientId, other);
}
