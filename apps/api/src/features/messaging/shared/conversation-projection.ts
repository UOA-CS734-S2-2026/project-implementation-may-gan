import type { DayliDatabase } from "@dayli/db";
import { projectMessageDto, type MessageProjectionRow } from "./message-projection";
import { requireSafeSequenceBigInt, requireSafeSequenceText } from "./safe-sequence";

type Row = Record<string, unknown>;
type ConversationProjectionRow = Row & { latestMessage?: MessageProjectionRow | null };
const date = (value: unknown) => new Date(String(value));

function sequenceText(sequence: unknown): string {
  return typeof sequence === "number"
    ? requireSafeSequenceBigInt(sequence).toString()
    : requireSafeSequenceText(sequence);
}

/** Projects the conversation fields shared by conversation reads and mutation responses. */
export async function projectConversationDto(
  database: DayliDatabase,
  row: ConversationProjectionRow,
  actorId: string,
) {
  const latest = row.latestMessage?.id ? await projectMessageDto(database, row.latestMessage, actorId) : null;
  const blocked = row.blocked === true;
  const participantsAvailable = row.participants_available === true;
  const actorParticipantId = String(row.member_participant_id ?? actorId);
  return {
    id: String(row.id),
    peer: {
      id: String(row.peer_id ?? (String(row.participant_low_id) === actorParticipantId ? row.participant_high_id : row.participant_low_id)),
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
      canSend: row.request_state === "active" && participantsAvailable && !blocked,
      canResolveRequest: row.request_state === "pending" && participantsAvailable && String(row.initiator_participant_id ?? row.initiator_id) !== actorParticipantId && !blocked,
    },
    updatedAt: date(row.updated_at).toISOString(),
  };
}
