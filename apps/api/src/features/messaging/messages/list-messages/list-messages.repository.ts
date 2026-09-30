import { and, asc, desc, eq, gt, lt } from "drizzle-orm";
import { createHyperdriveDatabase, schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { messageProjectionSelection, projectMessageDto } from "../../shared/message-projection";
import type { MessageDto } from "../../shared/messaging-types";
import { parseSequenceCursor, requireSafeSequenceBigInt } from "../../shared/safe-sequence";
import { requireConversationMember } from "../../shared/require-conversation-member";

export interface ListMessagesRepository {
  list(
    actorId: string,
    conversationId: string,
    before: string | undefined,
    after: string | undefined,
    limit: number,
  ): Promise<{ items: MessageDto[]; nextCursor: string | null; hasMore: boolean }>;
}

export function createPostgresListMessagesRepository(database: DayliDatabase): ListMessagesRepository {
  return {
    async list(actorId, conversationId, before, after, limit) {
      await requireConversationMember(database, actorId, conversationId);
      const beforeSequence = before === undefined ? undefined : parseSequenceCursor(before);
      const afterSequence = after === undefined ? undefined : parseSequenceCursor(after);
      const cursorPredicate = beforeSequence !== undefined
        ? lt(schema.messages.sequence, beforeSequence)
        : afterSequence !== undefined
        ? gt(schema.messages.sequence, afterSequence)
        : undefined;
      const result = await database
        .select(messageProjectionSelection)
        .from(schema.messages)
        .where(and(eq(schema.messages.conversationId, conversationId), cursorPredicate))
        .orderBy(afterSequence !== undefined ? asc(schema.messages.sequence) : desc(schema.messages.sequence))
        .limit(limit + 1);
      const page = result.slice(0, limit);
      const ordered = afterSequence !== undefined ? page : page.reverse();
      return {
        items: await Promise.all(ordered.map((item) => projectMessageDto(database, item, actorId))),
        nextCursor: result.length > limit ? requireSafeSequenceBigInt(page.at(-1)!.sequence).toString() : null,
        hasMore: result.length > limit,
      };
    },
  };
}

export function createHyperdriveListMessagesRepository(hyperdrive: HyperdriveBinding): ListMessagesRepository {
  return {
    async list(actorId, conversationId, before, after, limit) {
      const database = createHyperdriveDatabase(hyperdrive);
      try {
        return await createPostgresListMessagesRepository(database.db).list(actorId, conversationId, before, after, limit);
      } finally {
        await database.close();
      }
    },
  };
}
