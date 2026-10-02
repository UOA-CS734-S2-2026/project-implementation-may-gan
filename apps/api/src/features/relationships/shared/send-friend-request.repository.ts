import { schema } from "@dayli/db";
import { and, count, eq, gte, min } from "drizzle-orm";
import { RelationshipStoreError, type StoredRelationshipSnapshot } from "./relationship-service";
import type { RelationshipPostgresContext } from "./relationship-postgres";

export async function insertFriendRequest(context: RelationshipPostgresContext, input: { senderId: string; recipientId: string; createdAt: string }): Promise<StoredRelationshipSnapshot> {
  const { senderId, recipientId, createdAt } = input;
  await context.lockPair(senderId, recipientId);
  await context.requireActiveTarget(senderId, recipientId);
  if (await context.activeBlock(senderId, recipientId)) throw new RelationshipStoreError("BLOCKED");
  const current = await context.snapshot(senderId, recipientId);
  if (current.friendships.actorToSubject?.state === "active" && current.friendships.subjectToActor?.state === "active") throw new RelationshipStoreError("ALREADY_FRIENDS");
  if (current.requests.incoming || current.requests.outgoing) throw new RelationshipStoreError("REQUEST_EXISTS");
  const createdAtDate = new Date(createdAt);
  const windowStart = new Date(createdAtDate.getTime() - 86_400_000);
  const [usage] = await context.queryable
    .select({ count: count(), oldest: min(schema.friendRequests.createdAt) })
    .from(schema.friendRequests)
    .where(and(
      eq(schema.friendRequests.senderId, senderId),
      eq(schema.friendRequests.recipientId, recipientId),
      gte(schema.friendRequests.createdAt, windowStart),
    ));
  if (usage && usage.count >= 5) {
    const oldest = usage.oldest ? new Date(usage.oldest).getTime() : Date.now();
    throw new RelationshipStoreError("THROTTLED", { retryAfterSeconds: Math.max(1, Math.ceil((oldest + 86_400_000 - new Date(createdAt).getTime()) / 1000)) });
  }
  try {
    await context.queryable.insert(schema.friendRequests).values({
      id: crypto.randomUUID(),
      senderId,
      recipientId,
      status: "pending",
      createdAt: createdAtDate,
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new RelationshipStoreError("REQUEST_EXISTS");
    throw error;
  }
  return context.snapshot(senderId, recipientId);
}
