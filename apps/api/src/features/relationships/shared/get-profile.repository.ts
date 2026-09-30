import { and, count, eq, exists, isNull, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { schema } from "@dayli/db";
import type { RelationshipUserCard } from "./relationship-service";
import type { RelationshipQueryable } from "./relationship-postgres";

/** Minimal, actor-scoped profile projection. Blocks are deliberately indistinguishable from an unknown handle. */
export async function findProfileByUsername(queryable: RelationshipQueryable, actorId: string, username: string): Promise<RelationshipUserCard | null> {
  const { friendRequests, friendships, relationshipBlocks, user } = schema;
  const candidate = alias(user, "candidate");
  const mine = alias(friendships, "mine");
  const reciprocal = alias(friendships, "reciprocal");
  const sameHandle = alias(user, "same_handle");
  const matchingHandleIsUnique = exists(
    queryable
      .select({ usernameKey: sql<string>`lower(${sameHandle.username})` })
      .from(sameHandle)
      .where(sql`lower(${sameHandle.username}) = lower(${username})`)
      .groupBy(sql`lower(${sameHandle.username})`)
      .having(eq(count(), 1)),
  );
  const relationship = sql<RelationshipUserCard["relationship"]>`
    case
      when ${candidate.id} = ${actorId} then 'none'
      when ${exists(
        queryable
          .select({ userId: mine.userId })
          .from(mine)
          .innerJoin(reciprocal, and(
            eq(reciprocal.userId, mine.friendId),
            eq(reciprocal.friendId, mine.userId),
            eq(reciprocal.state, "active"),
          ))
          .where(and(
            eq(mine.userId, actorId),
            eq(mine.friendId, candidate.id),
            eq(mine.state, "active"),
          )),
      )} then 'friends'
      when ${exists(
        queryable.select({ id: friendRequests.id }).from(friendRequests).where(and(
          eq(friendRequests.status, "pending"),
          eq(friendRequests.senderId, actorId),
          eq(friendRequests.recipientId, candidate.id),
        )),
      )} then 'outgoing_pending'
      when ${exists(
        queryable.select({ id: friendRequests.id }).from(friendRequests).where(and(
          eq(friendRequests.status, "pending"),
          eq(friendRequests.senderId, candidate.id),
          eq(friendRequests.recipientId, actorId),
        )),
      )} then 'incoming_pending'
      else 'none'
    end
  `;
  const [row] = await queryable
    .select({
      id: candidate.id,
      username: candidate.username,
      displayName: sql<string>`coalesce(${candidate.displayUsername}, ${candidate.username})`,
      relationship,
    })
    .from(candidate)
    .where(and(
      sql`lower(${candidate.username}) = lower(${username})`,
      matchingHandleIsUnique,
      sql`(coalesce(${candidate.banned}, false) = false or (${candidate.banExpires} is not null and ${candidate.banExpires} <= now()))`,
      notExists(queryable.select({ one: sql`1` }).from(schema.accountLifecycles).where(and(
        eq(schema.accountLifecycles.userId, candidate.id),
        eq(schema.accountLifecycles.state, "pending_deletion"),
      ))),
      notExists(
        queryable.select({ blockerId: relationshipBlocks.blockerId }).from(relationshipBlocks).where(and(
          isNull(relationshipBlocks.unblockedAt),
          or(
            and(eq(relationshipBlocks.blockerId, actorId), eq(relationshipBlocks.blockedId, candidate.id)),
            and(eq(relationshipBlocks.blockerId, candidate.id), eq(relationshipBlocks.blockedId, actorId)),
          ),
        )),
      ),
    ))
    .limit(1);
  return row ? { id: row.id, username: row.username!, displayName: row.displayName, relationship: row.relationship } : null;
}
