import { and, asc, eq, gt } from "drizzle-orm";
import { createHyperdriveDatabase, schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { parseSequenceCursor, requireSafeSequenceBigInt, requireSafeSequenceText } from "../../shared/safe-sequence";
import { requireConversationMember } from "../../shared/require-conversation-member";

export interface ListConversationChangesRepository {
  list(
    actorId: string,
    conversationId: string,
    afterChangeSequence: string | undefined,
    limit: number,
  ): Promise<{
    items: Array<{
      changeSequence: string;
      kind: string;
      messageId: string | null;
      memberId: string | null;
      createdAt: string;
    }>;
    nextChangeSequence: string | null;
    hasMore: boolean;
    highWatermark: string;
  }>;
}

export function createPostgresListConversationChangesRepository(
  database: DayliDatabase,
): ListConversationChangesRepository {
  return {
    async list(actorId, conversationId, afterChangeSequence, limit) {
      const conversation = await requireConversationMember(database, actorId, conversationId);
      const afterSequence = afterChangeSequence === undefined ? 0 : parseSequenceCursor(afterChangeSequence);
      const result = await database
        .select({
          changeSequence: schema.conversationChanges.changeSequence,
          kind: schema.conversationChanges.kind,
          messageId: schema.conversationChanges.messageId,
          memberId: schema.conversationChanges.memberParticipantId,
          createdAt: schema.conversationChanges.createdAt,
        })
        .from(schema.conversationChanges)
        .where(and(
          eq(schema.conversationChanges.conversationId, conversationId),
          gt(schema.conversationChanges.changeSequence, afterSequence),
        ))
        .orderBy(asc(schema.conversationChanges.changeSequence))
        .limit(limit + 1);
      const page = result.slice(0, limit);
      return {
        items: page.map((item) => ({
          changeSequence: requireSafeSequenceBigInt(item.changeSequence).toString(),
          kind: item.kind,
          messageId: item.messageId,
          memberId: item.memberId,
          createdAt: item.createdAt.toISOString(),
        })),
        nextChangeSequence: result.length > limit
          ? requireSafeSequenceBigInt(page.at(-1)!.changeSequence).toString()
          : null,
        hasMore: result.length > limit,
        highWatermark: requireSafeSequenceText(String(conversation.last_change_sequence)),
      };
    },
  };
}

export function createHyperdriveListConversationChangesRepository(
  hyperdrive: HyperdriveBinding,
): ListConversationChangesRepository {
  return {
    async list(actorId, conversationId, afterChangeSequence, limit) {
      const database = createHyperdriveDatabase(hyperdrive);
      try {
        return await createPostgresListConversationChangesRepository(database.db).list(
          actorId,
          conversationId,
          afterChangeSequence,
          limit,
        );
      } finally {
        await database.close();
      }
    },
  };
}
