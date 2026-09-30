import { and, count, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { createHyperdriveDatabase, schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { projectConversationDto } from "../../shared/conversation-projection";
import { messageProjectionSelection } from "../../shared/message-projection";
import { requireConversationMember } from "../../shared/require-conversation-member";
import { requireSafeSequenceText } from "../../shared/safe-sequence";

export interface GetConversationRepository {
  get(actorId: string, conversationId: string): Promise<unknown>;
}

export function createPostgresGetConversationRepository(database: DayliDatabase): GetConversationRepository {
  return {
    async get(actorId, conversationId) {
      const row = await requireConversationMember(database, actorId, conversationId);
      const peer = String(row.user_low_id) === actorId ? String(row.user_high_id) : String(row.user_low_id);
      const lastReadSequence = Number(requireSafeSequenceText(row.last_read_sequence));
      const [user] = await database
        .select({ name: sql<string | null>`coalesce(${schema.user.displayUsername}, ${schema.user.username})` })
        .from(schema.user)
        .where(eq(schema.user.id, peer))
        .limit(1);
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
        peer_id: peer,
        peer_name: user?.name,
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
