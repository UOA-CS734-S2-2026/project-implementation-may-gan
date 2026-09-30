import { sql, type DayliDatabase } from "@dayli/db";
import type { MessageDto, StoredMessage } from "./messaging-types";

type Row = Record<string, unknown>;
type Queryable = Pick<DayliDatabase, "execute">;
const rows = <T extends Row>(value: unknown) => [...value as Iterable<T>];
const bigint = (value: unknown) => typeof value === "bigint" ? value : BigInt(String(value));
const date = (value: unknown) => new Date(String(value));

function storedMessage(row: Row): StoredMessage {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    sequence: bigint(row.sequence),
    senderId: String(row.sender_participant_id),
    clientMessageId: String(row.client_message_id),
    requestFingerprint: String(row.request_fingerprint),
    body: row.body === null ? null : String(row.body),
    replyToMessageId: row.reply_to_message_id === null ? null : String(row.reply_to_message_id),
    version: Number(row.version),
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
    ? rows<Row>(await queryable.execute(sql`select * from public.messages where id = ${message.replyToMessageId} and conversation_id = ${message.conversationId}`))[0]
    : undefined;
  const reactions = rows<{ reaction: string; count: number | string; reacted: boolean }>(await queryable.execute(sql`
    select reaction, count(*)::int as count, bool_or(participant_id = ${actorId}) as reacted
    from public.message_reactions where message_id = ${message.id} group by reaction
  `));
  message.reactions = reactions.map((item) => ({
    reaction: item.reaction as StoredMessage["reactions"][number]["reaction"],
    count: Number(item.count),
    reactedByActor: item.reacted,
  }));
  return toMessageDto(message, parent ? storedMessage(parent) : null);
}
