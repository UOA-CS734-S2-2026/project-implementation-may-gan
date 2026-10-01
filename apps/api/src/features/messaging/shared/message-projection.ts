import { and, eq } from "drizzle-orm";
import { schema, sql, type DayliDatabase } from "@dayli/db";
import type { MessageDto, StoredMessage } from "./messaging-types";
import { requireSafeMessageVersion, requireSafeSequenceText } from "./safe-sequence";

type Row = Record<string, unknown>;
export type MessageProjectionRow = Row;
type Queryable = Pick<DayliDatabase, "select">;
const date = (value: unknown) => new Date(String(value));

function storedMessage(row: Row): StoredMessage {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    sequence: BigInt(requireSafeSequenceText(row.sequence)),
    senderId: String(row.sender_id),
    clientMessageId: String(row.client_message_id),
    requestFingerprint: String(row.request_fingerprint),
    body: row.body === null ? null : String(row.body),
    replyToMessageId: row.reply_to_message_id === null ? null : String(row.reply_to_message_id),
    version: requireSafeMessageVersion(typeof row.version === "string" || typeof row.version === "number" ? row.version : ""),
    createdAt: date(row.created_at),
    editedAt: row.edited_at ? date(row.edited_at) : null,
    unsentAt: row.unsent_at ? date(row.unsent_at) : null,
    reactions: [],
  };
}

/**
 * Canonical projection. Tombstones expose stable ordering metadata but never a
 * former body or copied reply text.
 */
export function toMessageDto(message: StoredMessage, parent?: StoredMessage | null): MessageDto {
  const replyPreview = message.replyToMessageId && parent
    ? {
        id: parent.id,
        senderId: parent.senderId,
        text: parent.unsentAt ? null : parent.body,
        unsentAt: parent.unsentAt?.toISOString() ?? null,
      }
    : null;
  return {
    id: message.id,
    conversationId: message.conversationId,
    sequence: message.sequence.toString(),
    senderId: message.senderId,
    clientMessageId: message.clientMessageId,
    text: message.unsentAt ? null : message.body,
    replyToMessageId: message.replyToMessageId,
    replyPreview,
    version: message.version,
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt?.toISOString() ?? null,
    unsentAt: message.unsentAt?.toISOString() ?? null,
    reactions: message.unsentAt ? [] : message.reactions,
  };
}

/** Resolves the shared reply and actor-specific reaction portions of a message DTO. */
export async function projectMessageDto(
  queryable: Queryable,
  row: Row,
  actorId: string,
): Promise<MessageDto> {
  const message = storedMessage(row);
  const parent = message.replyToMessageId
    ? (await queryable
      .select({
        id: schema.messages.id,
        conversation_id: schema.messages.conversationId,
        sequence: sql<string>`${schema.messages.sequence}::text`,
        sender_id: schema.messages.senderParticipantId,
        client_message_id: schema.messages.clientMessageId,
        request_fingerprint: schema.messages.requestFingerprint,
        body: schema.messages.body,
        reply_to_message_id: schema.messages.replyToMessageId,
        version: sql<string>`${schema.messages.version}::text`,
        created_at: schema.messages.createdAt,
        edited_at: schema.messages.editedAt,
        unsent_at: schema.messages.unsentAt,
      })
      .from(schema.messages)
      .where(and(
        eq(schema.messages.id, message.replyToMessageId),
        eq(schema.messages.conversationId, message.conversationId),
      ))
      .limit(1))[0]
    : undefined;
  const reactions = await queryable
    .select({
      reaction: schema.messageReactions.reaction,
      count: sql<number>`count(*)::int`,
      reacted: sql<boolean>`bool_or(${schema.messageReactions.participantId} = ${actorId})`,
    })
    .from(schema.messageReactions)
    .where(eq(schema.messageReactions.messageId, message.id))
    .groupBy(schema.messageReactions.reaction);
  message.reactions = reactions.map((item) => ({
    reaction: item.reaction as StoredMessage["reactions"][number]["reaction"],
    count: Number(item.count),
    reactedByActor: item.reacted,
  }));
  return toMessageDto(message, parent ? storedMessage(parent) : null);
}
