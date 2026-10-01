import { and, eq } from "drizzle-orm";
import { schema, type DayliDatabase } from "@dayli/db";
import { MessagingError } from "./messaging-error";
import { requireSafeSequenceBigInt } from "./safe-sequence";
import { participantIdForUser } from "./participant-identity";
import { conversationPairBlocked, conversationParticipantsAvailable } from "./conversation-participants";

type Conversation = typeof schema.conversations.$inferSelect;
type ConversationMember = typeof schema.conversationMembers.$inferSelect;
type Queryable = Pick<DayliDatabase, "select">;

export type ConversationMemberRow = {
  id: Conversation["id"];
  kind: Conversation["kind"];
  user_low_id: Conversation["userLowId"];
  user_high_id: Conversation["userHighId"];
  participant_low_id: Conversation["participantLowId"];
  participant_high_id: Conversation["participantHighId"];
  initiator_id: Conversation["initiatorId"];
  initiator_participant_id: Conversation["initiatorParticipantId"];
  member_participant_id: ConversationMember["participantId"];
  request_state: Conversation["requestState"];
  last_message_sequence: Conversation["lastMessageSequence"];
  last_change_sequence: Conversation["lastChangeSequence"];
  last_activity_at: Conversation["lastActivityAt"];
  created_at: Conversation["createdAt"];
  updated_at: Conversation["updatedAt"];
  last_read_sequence: ConversationMember["lastReadSequence"];
  receipt_sequence: ConversationMember["receiptSequence"];
  blocked: boolean;
  participants_available: boolean;
};

/** Requires actor membership while keeping private conversations indistinguishable from absent ones. */
export async function requireConversationMember(
  queryable: Queryable,
  actorId: string,
  conversationId: string,
  lock = false,
): Promise<ConversationMemberRow> {
  const blocked = conversationPairBlocked(
    queryable,
    schema.conversations.participantLowId,
    schema.conversations.participantHighId,
  );
  const participantsAvailable = conversationParticipantsAvailable(
    schema.conversations.participantLowId,
    schema.conversations.participantHighId,
  );
  const query = queryable
    .select({
      id: schema.conversations.id,
      kind: schema.conversations.kind,
      user_low_id: schema.conversations.userLowId,
      user_high_id: schema.conversations.userHighId,
      participant_low_id: schema.conversations.participantLowId,
      participant_high_id: schema.conversations.participantHighId,
      initiator_id: schema.conversations.initiatorId,
      initiator_participant_id: schema.conversations.initiatorParticipantId,
      member_participant_id: schema.conversationMembers.participantId,
      request_state: schema.conversations.requestState,
      last_message_sequence: schema.conversations.lastMessageSequence,
      last_change_sequence: schema.conversations.lastChangeSequence,
      last_activity_at: schema.conversations.lastActivityAt,
      created_at: schema.conversations.createdAt,
      updated_at: schema.conversations.updatedAt,
      last_read_sequence: schema.conversationMembers.lastReadSequence,
      receipt_sequence: schema.conversationMembers.receiptSequence,
      blocked,
      participants_available: participantsAvailable,
    })
    .from(schema.conversations)
    .innerJoin(
      schema.conversationMembers,
      and(
        eq(schema.conversationMembers.conversationId, schema.conversations.id),
        eq(schema.conversationMembers.participantId, participantIdForUser(actorId)),
      ),
    )
    .where(eq(schema.conversations.id, conversationId))
    .limit(1);
  const [row] = lock
    ? await query.for("update", { of: [schema.conversations, schema.conversationMembers] })
    : await query;
  if (!row) throw new MessagingError("NOT_FOUND");
  requireSafeSequenceBigInt(row.last_message_sequence);
  requireSafeSequenceBigInt(row.last_change_sequence);
  requireSafeSequenceBigInt(row.receipt_sequence);
  requireSafeSequenceBigInt(row.last_read_sequence);
  return row;
}
