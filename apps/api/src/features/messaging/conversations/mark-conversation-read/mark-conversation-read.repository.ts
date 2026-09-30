import { createHyperdriveDatabase, schema, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { and, eq, isNull, ne } from "drizzle-orm";
import { appendConversationChange } from "../../shared/append-conversation-change";
import { MessagingError } from "../../shared/messaging-error";
import { requireConversationMember } from "../../shared/require-conversation-member";

export interface MarkConversationReadRepository {
  markRead(
    actorId: string,
    conversationId: string,
    throughSequence: string,
  ): Promise<{ lastReadSequence: string; receiptSequence: string; unreadCount: number }>;
}

function relationshipPairKey(leftUserId: string, rightUserId: string): string {
  return [leftUserId, rightUserId]
    .sort()
    .map((value) => `${value.length}:${value}`)
    .join(":");
}

async function lockRelationshipPair(
  database: Pick<DayliDatabase, "select">,
  leftUserId: string,
  rightUserId: string,
): Promise<void> {
  const locks = await database
    .select({ lock: sql`pg_advisory_xact_lock(hashtextextended(${relationshipPairKey(leftUserId, rightUserId)}, 734))` })
    .from(sql`(values (1)) as lock_source`);
  if (locks.length !== 1) throw new Error("Relationship pair lock did not return exactly one row.");
}

export function createPostgresMarkConversationReadRepository(
  database: DayliDatabase,
): MarkConversationReadRepository {
  return {
    async markRead(actorId, conversationId, through) {
      return database.transaction(async (tx) => {
        const [pair] = await tx
          .select({
            participantLowId: schema.conversations.participantLowId,
            participantHighId: schema.conversations.participantHighId,
          })
          .from(schema.conversations)
          .where(eq(schema.conversations.id, conversationId))
          .limit(1);
        if (!pair) throw new MessagingError("NOT_FOUND");
        await lockRelationshipPair(tx, pair.participantLowId, pair.participantHighId);

        const row = await requireConversationMember(tx, actorId, conversationId, true);
        const max = BigInt(String(row.last_message_sequence));
        const target = BigInt(through) > max ? max : BigInt(through);
        const allowedReceipt = row.request_state === "active" && row.blocked !== true;
        const [updated] = await tx
          .update(schema.conversationMembers)
          .set({
            lastReadSequence: sql`greatest(${schema.conversationMembers.lastReadSequence}, ${target.toString()}::bigint)`,
            receiptSequence: allowedReceipt
              ? sql`greatest(${schema.conversationMembers.receiptSequence}, ${target.toString()}::bigint)`
              : schema.conversationMembers.receiptSequence,
            updatedAt: sql`now()`,
          })
          .where(and(
            eq(schema.conversationMembers.conversationId, conversationId),
            eq(schema.conversationMembers.participantId, actorId),
          ))
          .returning({
            lastReadSequence: sql<string>`${schema.conversationMembers.lastReadSequence}::text`,
            receiptSequence: sql<string>`${schema.conversationMembers.receiptSequence}::text`,
          });
        if (!updated) throw new MessagingError("NOT_FOUND");

        if (allowedReceipt) {
          await appendConversationChange(tx, conversationId, "read.updated", null, actorId, new Date());
        }
        const [unread] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(schema.messages)
          .where(and(
            eq(schema.messages.conversationId, conversationId),
            ne(schema.messages.senderParticipantId, actorId),
            sql`${schema.messages.sequence} > ${updated.lastReadSequence}::bigint`,
            isNull(schema.messages.unsentAt),
          ));
        return {
          lastReadSequence: updated.lastReadSequence,
          receiptSequence: updated.receiptSequence,
          unreadCount: unread?.count ?? 0,
        };
      });
    },
  };
}

export function createHyperdriveMarkConversationReadRepository(
  hyperdrive: HyperdriveBinding,
): MarkConversationReadRepository {
  return {
    async markRead(actorId, conversationId, throughSequence) {
      const database = createHyperdriveDatabase(hyperdrive);
      try {
        return await createPostgresMarkConversationReadRepository(database.db).markRead(
          actorId,
          conversationId,
          throughSequence,
        );
      } finally {
        await database.close();
      }
    },
  };
}
