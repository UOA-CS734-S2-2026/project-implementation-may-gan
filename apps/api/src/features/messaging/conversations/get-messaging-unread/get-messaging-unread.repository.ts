import { createHyperdriveDatabase, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";

type Row = Record<string, unknown>;
const rows = <T extends Row>(value: unknown) => [...value as Iterable<T>];

export interface GetMessagingUnreadRepository {
  get(actorId: string): Promise<{ inboxCount: number; requestCount: number }>;
}

export function createPostgresGetMessagingUnreadRepository(
  database: DayliDatabase,
): GetMessagingUnreadRepository {
  return {
    async get(actorId) {
      const result = rows<{ inbox: number; requests: number }>(await database.execute(sql`
        select count(*) filter (where c.request_state = 'active')::int as inbox,
          count(*) filter (where c.request_state = 'pending' and c.initiator_id <> ${actorId})::int as requests
        from public.conversation_members m
        join public.conversations c on c.id = m.conversation_id
        join public.messages x on x.conversation_id = c.id and x.sender_id <> ${actorId}
          and x.sequence > m.last_read_sequence and x.unsent_at is null
        where m.user_id = ${actorId}
      `));
      return { inboxCount: result[0]?.inbox ?? 0, requestCount: result[0]?.requests ?? 0 };
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
