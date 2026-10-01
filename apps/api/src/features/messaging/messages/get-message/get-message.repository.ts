import { and, eq } from "drizzle-orm";
import { createHyperdriveDatabase, schema, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { projectMessageDto } from "../../shared/message-projection";
import { MessagingError } from "../../shared/messaging-error";
import type { MessageDto } from "../../shared/messaging-types";
import { requireConversationMember } from "../../shared/require-conversation-member";

type Row = Record<string, unknown>;

type MessageLookup = {
  id: string;
  conversationId: string;
  sequence: string;
  senderId: string;
  clientMessageId: string;
  requestFingerprint: string;
  body: string | null;
  replyToMessageId: string | null;
  version: string;
  createdAt: Date;
  editedAt: Date | null;
  unsentAt: Date | null;
};

function toMessageProjectionRow(message: MessageLookup): Row {
  return {
    id: message.id,
    conversation_id: message.conversationId,
    sequence: message.sequence,
    sender_id: message.senderId,
    client_message_id: message.clientMessageId,
    request_fingerprint: message.requestFingerprint,
    body: message.body,
    reply_to_message_id: message.replyToMessageId,
    version: message.version,
    created_at: message.createdAt,
    edited_at: message.editedAt,
    unsent_at: message.unsentAt,
  };
}

export interface GetMessageRepository {
  get(actorId: string, conversationId: string, messageId: string): Promise<MessageDto>;
}

export function createPostgresGetMessageRepository(database: DayliDatabase): GetMessageRepository {
  return {
    async get(actorId, conversationId, messageId) {
      await requireConversationMember(database, actorId, conversationId);
      const [message] = await database
        .select({
          id: schema.messages.id,
          conversationId: schema.messages.conversationId,
          sequence: sql<string>`${schema.messages.sequence}::text`,
          senderId: schema.messages.senderParticipantId,
          clientMessageId: schema.messages.clientMessageId,
          requestFingerprint: schema.messages.requestFingerprint,
          body: schema.messages.body,
          replyToMessageId: schema.messages.replyToMessageId,
          version: sql<string>`${schema.messages.version}::text`,
          createdAt: schema.messages.createdAt,
          editedAt: schema.messages.editedAt,
          unsentAt: schema.messages.unsentAt,
        })
        .from(schema.messages)
        .where(and(
          eq(schema.messages.conversationId, conversationId),
          eq(schema.messages.id, messageId),
        ))
        .limit(1);
      if (!message) throw new MessagingError("NOT_FOUND");
      return projectMessageDto(database, toMessageProjectionRow(message), actorId);
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
