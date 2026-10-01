import { createHyperdriveDatabase, schema, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { and, count, desc, eq, gt, isNull, ne } from "drizzle-orm";
import { appendConversationChange } from "../../shared/append-conversation-change";
import { projectConversationDto } from "../../shared/conversation-projection";
import { messageProjectionSelection } from "../../shared/message-projection";
import { MessagingError } from "../../shared/messaging-error";
import { requireConversationMember } from "../../shared/require-conversation-member";
import { requireSafeSequenceBigInt } from "../../shared/safe-sequence";
import { lockActiveConversationParticipants } from "../../shared/conversation-participants";

export interface ResolveMessageRequestRepository {
  resolve(
    actorId: string,
    conversationId: string,
    decision: "accept" | "decline",
  ): Promise<unknown>;
}


async function conversationAfterResolution(
  database: DayliDatabase,
  actorId: string,
  conversationId: string,
) {
  const row = await requireConversationMember(database, actorId, conversationId);
  const peerParticipantId = String(row.participant_low_id) === String(row.member_participant_id)
    ? row.participant_high_id
    : row.participant_low_id;
  if (!peerParticipantId) throw new Error("Conversation peer participant is missing.");
  const lastReadSequence = Number(requireSafeSequenceBigInt(row.last_read_sequence));
  const [peer] = await database
    .select({
      id: schema.messagingParticipants.id,
      name: sql<string | null>`case when ${schema.messagingParticipants.state} = 'active'
          and coalesce(${schema.accountLifecycles.state}, 'active') = 'active'
        then coalesce(nullif(${schema.user.displayUsername}, ''), nullif(${schema.user.username}, ''))
        else 'Deleted account'
      end`,
    })
    .from(schema.messagingParticipants)
    .leftJoin(schema.user, eq(schema.user.id, schema.messagingParticipants.userId))
    .leftJoin(schema.accountLifecycles, eq(schema.accountLifecycles.userId, schema.user.id))
    .where(eq(schema.messagingParticipants.id, peerParticipantId))
    .limit(1);
  if (!peer) throw new Error("Conversation peer participant is missing.");
  const [latest] = await database
    .select(messageProjectionSelection)
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .orderBy(desc(schema.messages.sequence))
    .limit(1);
  const [unread] = await database
    .select({ count: count() })
    .from(schema.messages)
    .where(and(
      eq(schema.messages.conversationId, conversationId),
      ne(schema.messages.senderParticipantId, row.member_participant_id!),
      gt(schema.messages.sequence, lastReadSequence),
      isNull(schema.messages.unsentAt),
    ));
  return projectConversationDto(database, {
    ...row,
    peer_id: peer.id,
    peer_name: peer.name,
    peer_deleted: peer.name === "Deleted account",
    unread_count: unread?.count ?? 0,
    latestMessage: latest ?? null,
  }, actorId);
}

export function createPostgresResolveMessageRequestRepository(
  database: DayliDatabase,
): ResolveMessageRequestRepository {
  return {
    async resolve(actorId, conversationId, decision) {
      await database.transaction(async (tx) => {
        const participants = await lockActiveConversationParticipants(tx, conversationId);
        if (!participants) throw new MessagingError("NOT_FOUND");
        // Positive activation requires both mappings to still be live after
        // canonical locks. Decline remains a safe surviving-member cleanup.
        if (decision === "accept" && (!participants.lowUserId || !participants.highUserId)) {
          throw new MessagingError("FORBIDDEN");
        }

        const row = await requireConversationMember(tx, actorId, conversationId, true);
        if (row.blocked === true) throw new MessagingError("BLOCKED");
        const state = decision === "accept" ? "active" : "declined";
        if (String(row.initiator_participant_id) === String(row.member_participant_id)) throw new MessagingError("FORBIDDEN");
        if (row.request_state === state) return;
        if (row.request_state !== "pending") throw new MessagingError("FORBIDDEN");

        await tx
          .update(schema.conversations)
          .set({ requestState: state, updatedAt: sql`now()` })
          .where(eq(schema.conversations.id, conversationId));
        await appendConversationChange(tx, conversationId, `request.${state}`, null, actorId, new Date());
      });
      return conversationAfterResolution(database, actorId, conversationId);
    },
  };
}

export function createHyperdriveResolveMessageRequestRepository(
  hyperdrive: HyperdriveBinding,
): ResolveMessageRequestRepository {
  return {
    async resolve(actorId, conversationId, decision) {
      const database = createHyperdriveDatabase(hyperdrive);
      try {
        return await createPostgresResolveMessageRequestRepository(database.db).resolve(
          actorId,
          conversationId,
          decision,
        );
      } finally {
        await database.close();
      }
    },
  };
}
