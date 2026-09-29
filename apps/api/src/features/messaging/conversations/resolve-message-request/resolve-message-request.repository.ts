import { createHyperdriveDatabase, lockRelationshipPair, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { appendConversationChange } from "../../shared/append-conversation-change";
import { projectConversationDto } from "../../shared/conversation-projection";
import { MessagingError } from "../../shared/messaging-error";
import { requireConversationMember } from "../../shared/require-conversation-member";

type Row = Record<string, unknown>;
const rows = <T extends Row>(value: unknown) => [...value as Iterable<T>];

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
  const peer = String(row.user_low_id) === actorId ? String(row.user_high_id) : String(row.user_low_id);
  const [user] = rows<Row>(await database.execute(sql`
    select id, coalesce(display_username, username) as name from public.user where id = ${peer}
  `));
  const [latest] = rows<Row>(await database.execute(sql`
    select * from public.messages where conversation_id = ${conversationId} order by sequence desc limit 1
  `));
  const unread = rows<{ count: number }>(await database.execute(sql`
    select count(*)::int as count from public.messages
    where conversation_id = ${conversationId} and sender_id <> ${actorId}
      and sequence > ${row.last_read_sequence}::bigint and unsent_at is null
  `))[0]?.count ?? 0;
  return projectConversationDto(database, {
    ...row,
    peer_id: peer,
    peer_name: user?.name,
    unread_count: unread,
    ...(latest ? {
      message_id: latest.id,
      message_conversation_id: latest.conversation_id,
      message_sequence: latest.sequence,
      message_sender_id: latest.sender_id,
      message_client_message_id: latest.client_message_id,
      message_request_fingerprint: latest.request_fingerprint,
      message_body: latest.body,
      message_reply_to_message_id: latest.reply_to_message_id,
      message_version: latest.version,
      message_created_at: latest.created_at,
      message_edited_at: latest.edited_at,
      message_unsent_at: latest.unsent_at,
    } : {}),
  }, actorId);
}

export function createPostgresResolveMessageRequestRepository(
  database: DayliDatabase,
): ResolveMessageRequestRepository {
  return {
    async resolve(actorId, conversationId, decision) {
      await database.transaction(async (tx) => {
        const [pair] = rows<Row>(await tx.execute(sql`
          select user_low_id, user_high_id from public.conversations where id = ${conversationId}
        `));
        if (!pair) throw new MessagingError("NOT_FOUND");
        await lockRelationshipPair(tx, String(pair.user_low_id), String(pair.user_high_id));
        const row = await requireConversationMember(tx, actorId, conversationId, true);
        if (row.blocked === true) throw new MessagingError("BLOCKED");
        const state = decision === "accept" ? "active" : "declined";
        if (String(row.initiator_id) === actorId) throw new MessagingError("FORBIDDEN");
        if (row.request_state === state) return;
        if (row.request_state !== "pending") throw new MessagingError("FORBIDDEN");
        await tx.execute(sql`
          update public.conversations set request_state = ${state}, updated_at = now()
          where id = ${conversationId}
        `);
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
