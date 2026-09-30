import { createHyperdriveDatabase, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { requireConversationMember } from "../../shared/require-conversation-member";

type Row = Record<string, unknown>;
const rows = <T extends Row>(value: unknown) => [...value as Iterable<T>];
const date = (value: unknown) => new Date(String(value));

export interface ListConversationChangesRepository {
  list(
    actorId: string,
    conversationId: string,
    afterChangeSequence: string | undefined,
    limit: number,
  ): Promise<{
    items: Array<{
      changeSequence: string;
      kind: string;
      messageId: string | null;
      memberId: string | null;
      createdAt: string;
    }>;
    nextChangeSequence: string | null;
    hasMore: boolean;
    highWatermark: string;
  }>;
}

export function createPostgresListConversationChangesRepository(
  database: DayliDatabase,
): ListConversationChangesRepository {
  return {
    async list(actorId, conversationId, afterChangeSequence, limit) {
      const conversation = await requireConversationMember(database, actorId, conversationId);
      const result = rows<Row>(await database.execute(sql`
        select * from public.conversation_changes
        where conversation_id = ${conversationId}
          and change_sequence > ${afterChangeSequence ?? "0"}::bigint
        order by change_sequence asc
        limit ${limit + 1}
      `));
      const page = result.slice(0, limit);
      return {
        items: page.map((item) => ({
          changeSequence: String(item.change_sequence),
          kind: String(item.kind),
          messageId: item.message_id ? String(item.message_id) : null,
          memberId: item.member_participant_id ? String(item.member_participant_id) : null,
          createdAt: date(item.created_at).toISOString(),
        })),
        nextChangeSequence: result.length > limit ? String(page.at(-1)!.change_sequence) : null,
        hasMore: result.length > limit,
        highWatermark: String(conversation.last_change_sequence),
      };
    },
  };
}

export function createHyperdriveListConversationChangesRepository(
  hyperdrive: HyperdriveBinding,
): ListConversationChangesRepository {
  return {
    async list(actorId, conversationId, afterChangeSequence, limit) {
      const database = createHyperdriveDatabase(hyperdrive);
      try {
        return await createPostgresListConversationChangesRepository(database.db).list(
          actorId,
          conversationId,
          afterChangeSequence,
          limit,
        );
      } finally {
        await database.close();
      }
    },
  };
}
