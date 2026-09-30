import { createHyperdriveDatabase, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { projectConversationDto } from "../../shared/conversation-projection";
import { requireConversationMember } from "../../shared/require-conversation-member";

type Row = Record<string, unknown>;
const rows = <T extends Row>(value: unknown) => [...value as Iterable<T>];

export interface GetConversationRepository {
  get(actorId: string, conversationId: string): Promise<unknown>;
}

export function createPostgresGetConversationRepository(database: DayliDatabase): GetConversationRepository {
  return {
    async get(actorId, conversationId) {
      const row = await requireConversationMember(database, actorId, conversationId);
      const peer = String(row.participant_low_id) === actorId ? String(row.participant_high_id) : String(row.participant_low_id);
      const [participant] = rows<Row>(await database.execute(sql`
        select participant.id, participant.state, coalesce(profile.display_username, profile.username) as name
        from public.messaging_participants participant
        left join public."user" profile on profile.id = participant.user_id and participant.state = 'active'
        where participant.id = ${peer}
      `));
      const [latest] = rows<Row>(await database.execute(sql`
        select * from public.messages where conversation_id = ${conversationId} order by sequence desc limit 1
      `));
      const unread = rows<{ count: number }>(await database.execute(sql`
        select count(*)::int as count from public.messages
        where conversation_id = ${conversationId} and sender_participant_id <> ${actorId}
          and sequence > ${row.last_read_sequence}::bigint and unsent_at is null
      `))[0]?.count ?? 0;
      return projectConversationDto(database, {
        ...row,
        peer_id: peer,
        peer_name: participant?.state === "deleted" ? "Deleted account" : participant?.name,
        unread_count: unread,
        ...(latest ? {
          message_id: latest.id,
          message_conversation_id: latest.conversation_id,
          message_sequence: latest.sequence,
          message_sender_participant_id: latest.sender_participant_id,
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
