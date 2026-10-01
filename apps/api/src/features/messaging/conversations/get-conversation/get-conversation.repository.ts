import { and, count, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { createHyperdriveDatabase, schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { projectConversationDto } from "../../shared/conversation-projection";
import { messageProjectionSelection } from "../../shared/message-projection";
import { requireConversationMember } from "../../shared/require-conversation-member";
import { requireSafeSequenceBigInt } from "../../shared/safe-sequence";

export interface GetConversationRepository {
  get(actorId: string, conversationId: string): Promise<unknown>;
}

export function createPostgresGetConversationRepository(database: DayliDatabase): GetConversationRepository {
  return {
    async get(actorId, conversationId) {
      const row = await requireConversationMember(database, actorId, conversationId);
      const peerParticipantId = String(row.user_low_id) === actorId
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
          ne(schema.messages.senderId, actorId),
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
    },
  };
}

export function createHyperdriveGetConversationRepository(hyperdrive: HyperdriveBinding): GetConversationRepository {
  return {
    async get(actorId, conversationId) {
      const database = createHyperdriveDatabase(hyperdrive);
      try {
        return await createPostgresGetConversationRepository(database.db).get(actorId, conversationId);
      } finally {
        await database.close();
      }
    },
  };
}
