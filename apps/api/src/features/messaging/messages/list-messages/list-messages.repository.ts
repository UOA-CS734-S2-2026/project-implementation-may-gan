import { createHyperdriveDatabase, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { projectMessageDto } from "../../shared/message-projection";
import type { MessageDto } from "../../shared/messaging-types";
import { requireConversationMember } from "../../shared/require-conversation-member";

type Row = Record<string, unknown>;
const rows = <T extends Row>(value: unknown) => [...value as Iterable<T>];

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
      const direction = before ? sql`and sequence < ${before}::bigint` : after ? sql`and sequence > ${after}::bigint` : sql``;
      const order = after ? sql`asc` : sql`desc`;
      const result = rows<Row>(await database.execute(sql`
        select * from public.messages
        where conversation_id = ${conversationId} ${direction}
        order by sequence ${order}
        limit ${limit + 1}
      `));
      const page = result.slice(0, limit);
      const ordered = after ? page : page.reverse();
      return {
        items: await Promise.all(ordered.map((item) => projectMessageDto(database, item, actorId))),
        nextCursor: result.length > limit ? String(page.at(-1)!.sequence) : null,
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
