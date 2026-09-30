import { and, asc, eq } from "drizzle-orm";
import { createHyperdriveDatabase, schema, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
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
      const result = await database
        .select({
          changeSequence: sql<string>`${schema.conversationChanges.changeSequence}::text`,
          kind: schema.conversationChanges.kind,
          messageId: schema.conversationChanges.messageId,
          memberId: schema.conversationChanges.memberParticipantId,
          createdAt: schema.conversationChanges.createdAt,
        })
        .from(schema.conversationChanges)
        .where(and(
          eq(schema.conversationChanges.conversationId, conversationId),
          sql`${schema.conversationChanges.changeSequence} > ${afterChangeSequence ?? "0"}::bigint`,
        ))
        .orderBy(asc(schema.conversationChanges.changeSequence))
        .limit(limit + 1);
      const page = result.slice(0, limit);
      return {
        items: page.map((item) => ({
          changeSequence: item.changeSequence,
          kind: item.kind,
          messageId: item.messageId,
          memberId: item.memberId,
          createdAt: item.createdAt.toISOString(),
        })),
        nextChangeSequence: result.length > limit ? page.at(-1)!.changeSequence : null,
        hasMore: result.length > limit,
        highWatermark: String(conversation.last_change_sequence),
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
