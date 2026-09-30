import { createHyperdriveDatabase, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { projectMessageDto } from "../../shared/message-projection";
import { MessagingError } from "../../shared/messaging-error";
import type { MessageDto } from "../../shared/messaging-types";
import { requireConversationMember } from "../../shared/require-conversation-member";

type Row = Record<string, unknown>;
const rows = <T extends Row>(value: unknown) => [...value as Iterable<T>];

export interface GetMessageRepository {
  get(actorId: string, conversationId: string, messageId: string): Promise<MessageDto>;
}

export function createPostgresGetMessageRepository(database: DayliDatabase): GetMessageRepository {
  return {
    async get(actorId, conversationId, messageId) {
      await requireConversationMember(database, actorId, conversationId);
      const [row] = rows<Row>(await database.execute(sql`
        select * from public.messages where conversation_id = ${conversationId} and id = ${messageId}
      `));
      if (!row) throw new MessagingError("NOT_FOUND");
      return projectMessageDto(database, row, actorId);
    },
  };
}

export function createHyperdriveGetMessageRepository(hyperdrive: HyperdriveBinding): GetMessageRepository {
  return {
    async get(actorId, conversationId, messageId) {
      const database = createHyperdriveDatabase(hyperdrive);
      try {
        return await createPostgresGetMessageRepository(database.db).get(actorId, conversationId, messageId);
      } finally {
        await database.close();
      }
    },
  };
}
