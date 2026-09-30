import { and, eq } from "drizzle-orm";
import { createHyperdriveDatabase, schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { messageProjectionSelection, projectMessageDto } from "../../shared/message-projection";
import { MessagingError } from "../../shared/messaging-error";
import type { MessageDto } from "../../shared/messaging-types";
import { requireConversationMember } from "../../shared/require-conversation-member";

export interface GetMessageRepository {
  get(actorId: string, conversationId: string, messageId: string): Promise<MessageDto>;
}

export function createPostgresGetMessageRepository(database: DayliDatabase): GetMessageRepository {
  return {
    async get(actorId, conversationId, messageId) {
      await requireConversationMember(database, actorId, conversationId);
      const [message] = await database
        .select(messageProjectionSelection)
        .from(schema.messages)
        .where(and(
          eq(schema.messages.conversationId, conversationId),
          eq(schema.messages.id, messageId),
        ))
        .limit(1);
      if (!message) throw new MessagingError("NOT_FOUND");
      return projectMessageDto(database, message, actorId);
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
