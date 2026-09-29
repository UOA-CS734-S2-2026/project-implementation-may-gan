import { createHyperdriveDatabase, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { projectConversationDto } from "../../shared/conversation-projection";
import { MessagingError } from "../../shared/messaging-error";

type Row = Record<string, unknown>;
const rows = <T extends Row>(value: unknown) => [...value as Iterable<T>];

export interface ListConversationsRepository {
  list(
    actorId: string,
    folder: "inbox" | "requests",
    cursor: string | undefined,
    limit: number,
  ): Promise<{ items: unknown[]; nextCursor: string | null }>;
}

function cursorEncode(row: Row) {
  return btoa(JSON.stringify([String(row.cursor_activity), String(row.id)]));
}

function cursorDecode(value: string | undefined): [string, string] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(atob(value));
    return Array.isArray(parsed) && typeof parsed[0] === "string" && typeof parsed[1] === "string"
      ? [parsed[0], parsed[1]]
      : null;
  } catch {
    throw new MessagingError("VALIDATION_FAILED");
  }
}

export function createPostgresListConversationsRepository(
  database: DayliDatabase,
): ListConversationsRepository {
  return {
    async list(actorId, folder, rawCursor, limit) {
      const cursor = cursorDecode(rawCursor);
      const state = folder === "inbox" ? "active" : "pending";
      const requestCondition = folder === "requests"
        ? sql`and c.initiator_id <> ${actorId}`
        : sql``;
      const cursorCondition = cursor
        ? sql`and (c.last_activity_at, c.id) < (${cursor[0]}::timestamptz, ${cursor[1]})`
        : sql``;
      const result = rows<Row>(await database.execute(sql`
        select c.*, to_char(c.last_activity_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF') as cursor_activity,
          m.last_read_sequence, m.receipt_sequence, p.id as peer_id,
          coalesce(p.display_username, p.username) as peer_name,
          lm.id as message_id, lm.conversation_id as message_conversation_id,
          lm.sequence as message_sequence, lm.sender_id as message_sender_id,
          lm.client_message_id as message_client_message_id,
          lm.request_fingerprint as message_request_fingerprint, lm.body as message_body,
          lm.reply_to_message_id as message_reply_to_message_id, lm.version as message_version,
          lm.created_at as message_created_at, lm.edited_at as message_edited_at,
          lm.unsent_at as message_unsent_at,
          (select count(*)::int from public.messages im
            where im.conversation_id = c.id and im.sender_id <> ${actorId}
              and im.sequence > m.last_read_sequence and im.unsent_at is null) as unread_count
        from public.conversations c
        join public.conversation_members m on m.conversation_id = c.id and m.user_id = ${actorId}
        join public.user p on p.id = case when c.user_low_id = ${actorId} then c.user_high_id else c.user_low_id end
        left join lateral (
          select * from public.messages x where x.conversation_id = c.id order by x.sequence desc limit 1
        ) lm on true
        where c.request_state = ${state} ${requestCondition} ${cursorCondition}
        order by c.last_activity_at desc, c.id desc
        limit ${limit + 1}
      `));
      const page = result.slice(0, limit);
      return {
        items: await Promise.all(page.map((item) => projectConversationDto(database, item, actorId))),
        nextCursor: result.length > limit ? cursorEncode(page.at(-1)!) : null,
      };
    },
  };
}

export function createHyperdriveListConversationsRepository(
  hyperdrive: HyperdriveBinding,
): ListConversationsRepository {
  return {
    async list(actorId, folder, cursor, limit) {
      const database = createHyperdriveDatabase(hyperdrive);
      try {
        return await createPostgresListConversationsRepository(database.db).list(
          actorId,
          folder,
          cursor,
          limit,
        );
      } finally {
        await database.close();
      }
    },
  };
}
