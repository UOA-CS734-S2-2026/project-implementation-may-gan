import { schema, sql } from "@dayli/db";
import { and, eq } from "drizzle-orm";
import { mapStoredMessage, type MessageWriteQueryable } from "./message-write-primitives";
import type { StoredMessage } from "../../shared/messaging-types";

export interface UpdateMessageRowInput {
  messageId: string;
  body?: string | null;
  editedAt?: Date | null;
  unsentAt?: Date | null;
  expectedVersion?: number;
}

/** Updates a message row inside the caller's already locked transaction. */
export async function updateMessageRow(
  queryable: MessageWriteQueryable,
  input: UpdateMessageRowInput,
): Promise<StoredMessage> {
  const [row] = await queryable
    .update(schema.messages)
    .set({
      body: input.body === undefined ? sql`${schema.messages.body}` : input.body,
      editedAt: input.editedAt === undefined ? sql`${schema.messages.editedAt}` : input.editedAt,
      unsentAt: input.unsentAt === undefined ? sql`${schema.messages.unsentAt}` : input.unsentAt,
      version: sql`${schema.messages.version} + 1`,
    })
    .where(and(
      eq(schema.messages.id, input.messageId),
      input.expectedVersion === undefined ? undefined : eq(schema.messages.version, input.expectedVersion),
    ))
    .returning({
      id: schema.messages.id,
      conversation_id: schema.messages.conversationId,
      sequence: sql<string>`${schema.messages.sequence}::text`,
      sender_id: schema.messages.senderId,
      client_message_id: schema.messages.clientMessageId,
      request_fingerprint: schema.messages.requestFingerprint,
      body: schema.messages.body,
      reply_to_message_id: schema.messages.replyToMessageId,
      version: schema.messages.version,
      created_at: schema.messages.createdAt,
      edited_at: schema.messages.editedAt,
      unsent_at: schema.messages.unsentAt,
    });
  if (!row) throw new Error("Message write conflict.");
  if (input.unsentAt !== undefined) {
    await queryable.delete(schema.messageReactions).where(eq(schema.messageReactions.messageId, input.messageId));
  }
  return mapStoredMessage(row);
}
