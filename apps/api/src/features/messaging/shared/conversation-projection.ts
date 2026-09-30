import type { DayliDatabase } from "@dayli/db";
import { projectLegacyMessageDto, projectMessageDto, type MessageProjectionRow } from "./message-projection";
import { requireSafeSequenceBigInt, requireSafeSequenceText } from "./safe-sequence";

type Row = Record<string, unknown>;
type ConversationProjectionRow = Row & { latestMessage?: MessageProjectionRow | null };
type LegacyMessageProjectionRow = Omit<MessageProjectionRow, "sequence" | "version"> & {
  sequence: string;
  version: string;
};
const date = (value: unknown) => new Date(String(value));

function sequenceText(sequence: unknown): string {
  return typeof sequence === "number"
    ? requireSafeSequenceBigInt(sequence).toString()
    : requireSafeSequenceText(sequence);
}

/**
 * Temporary adapter for resolve-message-request's legacy snake_case,
 * text-mode conversation message selection. Remove when that query migrates.
 */
function legacyMessageProjectionRow(row: Row): LegacyMessageProjectionRow {
  return {
    id: String(row.message_id),
    conversationId: String(row.message_conversation_id),
    sequence: String(row.message_sequence),
    senderId: String(row.message_sender_id),
    clientMessageId: String(row.message_client_message_id),
    requestFingerprint: String(row.message_request_fingerprint),
    body: row.message_body === null ? null : String(row.message_body),
    replyToMessageId: row.message_reply_to_message_id === null ? null : String(row.message_reply_to_message_id),
    version: String(row.message_version),
    createdAt: date(row.message_created_at),
    editedAt: row.message_edited_at ? date(row.message_edited_at) : null,
    unsentAt: row.message_unsent_at ? date(row.message_unsent_at) : null,
  };
}

/** Projects the conversation fields shared by conversation reads and mutation responses. */
export async function projectConversationDto(
  database: DayliDatabase,
  row: ConversationProjectionRow,
  actorId: string,
) {
  const latest = row.latestMessage
    ? await projectMessageDto(database, row.latestMessage, actorId)
    : row.message_id
    ? await projectLegacyMessageDto(database, legacyMessageProjectionRow(row), actorId)
    : null;
  const blocked = row.blocked === true;
  return {
    id: String(row.id),
    peer: {
      id: String(row.peer_id ?? (String(row.user_low_id) === actorId ? row.user_high_id : row.user_low_id)),
      name: typeof row.peer_name === "string" ? row.peer_name : null,
    },
    requestState: row.request_state,
    latestMessage: latest,
    unreadCount: Number(row.unread_count ?? 0),
    lastMessageSequence: sequenceText(row.last_message_sequence),
    lastChangeSequence: sequenceText(row.last_change_sequence),
    lastReadSequence: sequenceText(row.last_read_sequence),
    receiptSequence: sequenceText(row.receipt_sequence),
    capabilities: {
      canSend: row.request_state === "active" && !blocked,
      canResolveRequest: row.request_state === "pending" && String(row.initiator_id) !== actorId && !blocked,
    },
    updatedAt: date(row.updated_at).toISOString(),
  };
}
