import { and, eq } from "drizzle-orm";
import { schema, sql, type DayliDatabase } from "@dayli/db";
import { MessagingError } from "./messaging-error";

type Row = Record<string, unknown>;
type Queryable = Pick<DayliDatabase, "select">;

/** Requires actor membership while keeping private conversations indistinguishable from absent ones. */
export async function requireConversationMember(
  queryable: Queryable,
  actorId: string,
  conversationId: string,
  lock = false,
): Promise<Row> {
  const blocked = sql<boolean>`exists(
    select 1
    from ${schema.relationshipBlocks}
    where ${schema.relationshipBlocks.unblockedAt} is null
      and (
        (${schema.relationshipBlocks.blockerId} = ${schema.conversations.userLowId}
          and ${schema.relationshipBlocks.blockedId} = ${schema.conversations.userHighId})
        or (${schema.relationshipBlocks.blockerId} = ${schema.conversations.userHighId}
          and ${schema.relationshipBlocks.blockedId} = ${schema.conversations.userLowId})
      )
  )`;
  const query = queryable
    .select({
      id: schema.conversations.id,
      kind: schema.conversations.kind,
      user_low_id: schema.conversations.userLowId,
      user_high_id: schema.conversations.userHighId,
      initiator_id: schema.conversations.initiatorId,
      request_state: schema.conversations.requestState,
      last_message_sequence: sql<string>`${schema.conversations.lastMessageSequence}::text`,
      last_change_sequence: sql<string>`${schema.conversations.lastChangeSequence}::text`,
      last_activity_at: schema.conversations.lastActivityAt,
      created_at: schema.conversations.createdAt,
      updated_at: schema.conversations.updatedAt,
      last_read_sequence: sql<string>`${schema.conversationMembers.lastReadSequence}::text`,
      receipt_sequence: sql<string>`${schema.conversationMembers.receiptSequence}::text`,
      blocked,
    })
    .from(schema.conversations)
    .innerJoin(
      schema.conversationMembers,
      and(
        eq(schema.conversationMembers.conversationId, schema.conversations.id),
        eq(schema.conversationMembers.userId, actorId),
      ),
    )
    .where(eq(schema.conversations.id, conversationId))
    .limit(1);
  const [row] = lock
    ? await query.for("update", { of: [schema.conversations, schema.conversationMembers] })
    : await query;
  if (!row) throw new MessagingError("NOT_FOUND");
  return row;
}
