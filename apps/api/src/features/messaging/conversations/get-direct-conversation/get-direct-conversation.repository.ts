import { and, eq, sql } from "drizzle-orm";
import { createHyperdriveDatabase, schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { MessagingError } from "../../shared/messaging-error";
import { participantIdForUser } from "../../shared/participant-identity";
import { conversationPairBlocked } from "../../shared/conversation-participants";

export interface GetDirectConversationRepository {
  find(actorId: string, recipientId: string): Promise<{ conversationId: string }>;
}

/** Only the authenticated conversation member may discover this pair's thread. */
export function createPostgresGetDirectConversationRepository(database: DayliDatabase): GetDirectConversationRepository {
  const { conversationMembers, conversations } = schema;
  return {
    async find(actorId, recipientId) {
      const [pair] = await database
        .select({
          id: conversations.id,
          blocked: conversationPairBlocked(database, conversations.participantLowId, conversations.participantHighId),
        })
        .from(conversations)
        .innerJoin(conversationMembers, and(
          eq(conversationMembers.conversationId, conversations.id),
          eq(conversationMembers.participantId, participantIdForUser(actorId)),
        ))
        .where(and(
          eq(conversations.participantLowId, sql`least(${participantIdForUser(actorId)}, ${participantIdForUser(recipientId)})`),
          eq(conversations.participantHighId, sql`greatest(${participantIdForUser(actorId)}, ${participantIdForUser(recipientId)})`),
        ))
        .limit(1);
      if (!pair) throw new MessagingError("NOT_FOUND");
      if (pair.blocked) throw new MessagingError("BLOCKED");
      return { conversationId: pair.id };
    },
  };
}

export function createHyperdriveGetDirectConversationRepository(hyperdrive: HyperdriveBinding): GetDirectConversationRepository {
  return {
    async find(actorId, recipientId) {
      const database = createHyperdriveDatabase(hyperdrive);
      try {
        return await createPostgresGetDirectConversationRepository(database.db).find(actorId, recipientId);
      } finally {
        await database.close();
      }
    },
  };
}
