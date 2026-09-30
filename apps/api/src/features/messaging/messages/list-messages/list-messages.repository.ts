import { and, asc, desc, eq } from "drizzle-orm";
import { createHyperdriveDatabase, schema, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { projectMessageDto } from "../../shared/message-projection";
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
      const cursorPredicate = before
        ? sql`${schema.messages.sequence} < ${before}::bigint`
        : after
        ? sql`${schema.messages.sequence} > ${after}::bigint`
        : undefined;
      const result = await database
        .select({
          id: schema.messages.id,
          conversationId: schema.messages.conversationId,
          sequence: sql<string>`${schema.messages.sequence}::text`,
          senderId: schema.messages.senderId,
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
        .where(and(eq(schema.messages.conversationId, conversationId), cursorPredicate))
        .orderBy(after ? asc(schema.messages.sequence) : desc(schema.messages.sequence))
        .limit(limit + 1);
      const page = result.slice(0, limit);
      const ordered = after ? page : page.reverse();
      return {
        items: await Promise.all(ordered.map((item) => projectMessageDto(database, toMessageProjectionRow(item), actorId))),
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
