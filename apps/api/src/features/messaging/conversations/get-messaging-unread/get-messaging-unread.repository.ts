import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { createHyperdriveDatabase, schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";

export interface GetMessagingUnreadRepository {
  get(actorId: string): Promise<{ inboxCount: number; requestCount: number }>;
}

export function createPostgresGetMessagingUnreadRepository(
  database: DayliDatabase,
): GetMessagingUnreadRepository {
  return {
    async get(actorId) {
      const [result] = await database
        .select({
          inbox: sql<number>`count(*) filter (where ${schema.conversations.requestState} = 'active')::int`,
          requests: sql<number>`count(*) filter (where ${schema.conversations.requestState} = 'pending' and ${schema.conversations.initiatorId} <> ${actorId})::int`,
        })
        .from(schema.conversationMembers)
        .innerJoin(
          schema.conversations,
          eq(schema.conversations.id, schema.conversationMembers.conversationId),
        )
        .innerJoin(schema.messages, and(
          eq(schema.messages.conversationId, schema.conversations.id),
          ne(schema.messages.senderId, actorId),
          gt(schema.messages.sequence, schema.conversationMembers.lastReadSequence),
          isNull(schema.messages.unsentAt),
        ))
        .where(eq(schema.conversationMembers.userId, actorId));
      return { inboxCount: result?.inbox ?? 0, requestCount: result?.requests ?? 0 };
    },
  };
}

export function createHyperdriveGetMessagingUnreadRepository(
  hyperdrive: HyperdriveBinding,
): GetMessagingUnreadRepository {
  return {
    async get(actorId) {
      const database = createHyperdriveDatabase(hyperdrive);
      try {
        return await createPostgresGetMessagingUnreadRepository(database.db).get(actorId);
      } finally {
        await database.close();
      }
    },
  };
}
