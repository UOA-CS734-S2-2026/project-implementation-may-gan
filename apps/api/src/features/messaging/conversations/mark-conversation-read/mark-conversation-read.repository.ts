import { createHyperdriveDatabase, lockRelationshipPair, schema, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { and, asc, count, eq, gt, inArray, isNull, ne, or } from "drizzle-orm";
import { appendConversationChange } from "../../shared/append-conversation-change";
import { MessagingError } from "../../shared/messaging-error";
import { requireConversationMember } from "../../shared/require-conversation-member";
import { parseSequenceCursor, requireSafeSequenceBigInt, toSafeSequenceNumber } from "../../shared/safe-sequence";

export interface MarkConversationReadRepository {
  markRead(
    actorId: string,
    conversationId: string,
    throughSequence: string,
  ): Promise<{ lastReadSequence: string; receiptSequence: string; unreadCount: number }>;
}

export function createPostgresMarkConversationReadRepository(
  database: DayliDatabase,
): MarkConversationReadRepository {
  return {
    async markRead(actorId, conversationId, through) {
      return database.transaction(async (tx) => {
        const [pair] = await tx
          .select({
            userLowId: schema.conversations.userLowId,
            userHighId: schema.conversations.userHighId,
          })
          .from(schema.conversations)
          .where(eq(schema.conversations.id, conversationId))
          .limit(1);
        if (!pair) throw new MessagingError("NOT_FOUND");
        await tx
          .select({ id: schema.user.id })
          .from(schema.user)
          .where(inArray(schema.user.id, [pair.userLowId, pair.userHighId]))
          .orderBy(asc(schema.user.id))
          .for("update");
        await lockRelationshipPair(tx, pair.userLowId, pair.userHighId);
        // This separate statement runs after waiting on lifecycle locks.
        const available = await tx
          .select({ id: schema.user.id })
          .from(schema.user)
          .innerJoin(schema.messagingParticipants, eq(schema.messagingParticipants.userId, schema.user.id))
          .leftJoin(schema.accountLifecycles, eq(schema.accountLifecycles.userId, schema.user.id))
          .where(and(
            inArray(schema.user.id, [pair.userLowId, pair.userHighId]),
            eq(schema.messagingParticipants.state, "active"),
            or(isNull(schema.accountLifecycles.state), eq(schema.accountLifecycles.state, "active")),
          ));

        const row = await requireConversationMember(tx, actorId, conversationId, true);
        const target = Math.min(parseSequenceCursor(through), row.last_message_sequence);
        const allowedReceipt = available.length === 2 && row.request_state === "active" && row.blocked !== true;
        const [updated] = await tx
          .update(schema.conversationMembers)
          .set({
            lastReadSequence: sql`greatest(${schema.conversationMembers.lastReadSequence}, ${target})`,
            receiptSequence: sql`greatest(${schema.conversationMembers.receiptSequence}, ${allowedReceipt ? target : 0})`,
            updatedAt: sql`now()`,
          })
          .where(and(
            eq(schema.conversationMembers.conversationId, conversationId),
            eq(schema.conversationMembers.userId, actorId),
          ))
          .returning({
            lastReadSequence: schema.conversationMembers.lastReadSequence,
            receiptSequence: schema.conversationMembers.receiptSequence,
          });
        if (!updated) throw new MessagingError("NOT_FOUND");

        const lastReadSequence = toSafeSequenceNumber(requireSafeSequenceBigInt(updated.lastReadSequence));
        const receiptSequence = toSafeSequenceNumber(requireSafeSequenceBigInt(updated.receiptSequence));
        if (allowedReceipt) {
          await appendConversationChange(tx, conversationId, "read.updated", null, actorId, new Date());
        }
        const [unread] = await tx
          .select({ count: count() })
          .from(schema.messages)
          .where(and(
            eq(schema.messages.conversationId, conversationId),
            ne(schema.messages.senderId, actorId),
            gt(schema.messages.sequence, lastReadSequence),
            isNull(schema.messages.unsentAt),
          ));
        return {
          lastReadSequence: String(lastReadSequence),
          receiptSequence: String(receiptSequence),
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
