import { RelationshipStoreError, type StoredRelationshipSnapshot } from "./relationship-service";
import { relationshipRows, sql, type RelationshipPostgresContext } from "./relationship-postgres";

export async function insertFriendRequest(context: RelationshipPostgresContext, input: { senderId: string; recipientId: string; createdAt: string }): Promise<StoredRelationshipSnapshot> {
  const { senderId, recipientId, createdAt } = input;
  await context.lockPair(senderId, recipientId);
  await context.requireTarget(senderId, recipientId);
  if (await context.activeBlock(senderId, recipientId)) throw new RelationshipStoreError("BLOCKED");
  const current = await context.snapshot(senderId, recipientId);
  if (current.friendships.actorToSubject?.state === "active" && current.friendships.subjectToActor?.state === "active") throw new RelationshipStoreError("ALREADY_FRIENDS");
  if (current.requests.incoming || current.requests.outgoing) throw new RelationshipStoreError("REQUEST_EXISTS");
  const countRows = relationshipRows<{ count: number | string; oldest: string | null }>(await context.queryable.execute(sql`
    select count(*)::int as count, min(created_at) as oldest from public.friend_requests
    where sender_id = ${senderId} and recipient_id = ${recipientId} and created_at >= ${createdAt}::timestamptz - interval '24 hours'
  `));
  const count = Number(countRows[0]?.count ?? 0);
  if (count >= 5) {
    const oldest = countRows[0]?.oldest ? new Date(String(countRows[0].oldest)).getTime() : Date.now();
    throw new RelationshipStoreError("THROTTLED", { retryAfterSeconds: Math.max(1, Math.ceil((oldest + 86_400_000 - new Date(createdAt).getTime()) / 1000)) });
  }
  try {
    await context.queryable.execute(sql`insert into public.friend_requests (id, sender_id, recipient_id, status, created_at) values (${crypto.randomUUID()}, ${senderId}, ${recipientId}, 'pending', ${createdAt}::timestamptz)`);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new RelationshipStoreError("REQUEST_EXISTS");
    throw error;
  }
  return context.snapshot(senderId, recipientId);
}
