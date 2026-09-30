import { createHyperdriveDatabase, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { MessagingError } from "../../shared/messaging-error";

export interface GetDirectConversationRepository {
  find(actorId: string, recipientId: string): Promise<{ conversationId: string }>;
}

type PairRow = { id: string; blocked: boolean };

/** Only the authenticated conversation member may discover this pair's thread. */
export function createPostgresGetDirectConversationRepository(database: DayliDatabase): GetDirectConversationRepository {
  return {
    async find(actorId, recipientId) {
      const [pair] = [...await database.execute(sql`
        select c.id, exists(
          select 1 from public.relationship_blocks b
          where b.unblocked_at is null
            and ((b.blocker_id = c.user_low_id and b.blocked_id = c.user_high_id)
              or (b.blocker_id = c.user_high_id and b.blocked_id = c.user_low_id))
        ) as blocked
        from public.conversations c
        join public.conversation_members mine on mine.conversation_id = c.id and mine.user_id = ${actorId}
        where c.user_low_id = least(${actorId}, ${recipientId})
          and c.user_high_id = greatest(${actorId}, ${recipientId})
        limit 1
      `) as Iterable<PairRow>];
      if (!pair) throw new MessagingError("NOT_FOUND");
      if (pair.blocked === true) throw new MessagingError("BLOCKED");
      return { conversationId: String(pair.id) };
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
