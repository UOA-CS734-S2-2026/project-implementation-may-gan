import type { DayliDatabase } from "@dayli/db";
import { projectMessageDto } from "./message-projection";

type Row = Record<string, unknown>;
const date = (value: unknown) => new Date(String(value));

/** Projects the conversation fields shared by conversation reads and mutation responses. */
export async function projectConversationDto(
  database: DayliDatabase,
  row: Row,
  actorId: string,
) {
  const latest = row.message_id ? await projectMessageDto(database, {
    id: row.message_id,
    conversation_id: row.message_conversation_id,
    sequence: row.message_sequence,
    sender_participant_id: row.message_sender_participant_id,
    client_message_id: row.message_client_message_id,
    request_fingerprint: row.message_request_fingerprint,
    body: row.message_body,
    reply_to_message_id: row.message_reply_to_message_id,
    version: row.message_version,
    created_at: row.message_created_at,
    edited_at: row.message_edited_at,
    unsent_at: row.message_unsent_at,
  }, actorId) : null;
  const blocked = row.blocked === true;
  return {
    id: String(row.id),
    peer: {
      id: String(row.peer_id ?? (String(row.participant_low_id) === actorId ? row.participant_high_id : row.participant_low_id)),
      name: typeof row.peer_name === "string" ? row.peer_name : null,
    },
    requestState: row.request_state,
    latestMessage: latest,
    unreadCount: Number(row.unread_count ?? 0),
    lastMessageSequence: String(row.last_message_sequence),
    lastChangeSequence: String(row.last_change_sequence),
    lastReadSequence: String(row.last_read_sequence),
    receiptSequence: String(row.receipt_sequence),
    capabilities: {
      canSend: row.request_state === "active" && !blocked,
      canResolveRequest: row.request_state === "pending" && String(row.initiator_participant_id) !== actorId && !blocked,
    },
    updatedAt: date(row.updated_at).toISOString(),
  };
}
