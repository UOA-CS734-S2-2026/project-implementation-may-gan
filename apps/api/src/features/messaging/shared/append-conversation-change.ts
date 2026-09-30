import { sql, type DayliDatabase } from "@dayli/db";

type Row = Record<string, unknown>;
type Queryable = Pick<DayliDatabase, "execute">;
const rows = <T extends Row>(value: unknown) => [...value as Iterable<T>];

/** Appends a durable change and its outbox records within the caller's transaction. */
export async function appendConversationChange(
  queryable: Queryable,
  conversationId: string,
  kind: string,
  messageId: string | null,
  memberId: string | null,
  now: Date,
): Promise<void> {
  const [change] = rows<{ sequence: unknown; participant_low_id: string; participant_high_id: string }>(await queryable.execute(sql`update public.conversations set last_change_sequence = last_change_sequence + 1, updated_at = ${now.toISOString()}::timestamptz where id = ${conversationId} returning last_change_sequence as sequence, participant_low_id, participant_high_id`));
  if (!change) throw new Error("Conversation disappeared during change append.");
  await queryable.execute(sql`insert into public.conversation_changes (conversation_id, change_sequence, kind, message_id, member_participant_id, created_at) values (${conversationId}, ${change.sequence}::bigint, ${kind}, ${messageId}, ${memberId}, ${now.toISOString()}::timestamptz)`);
  const eventId = crypto.randomUUID();
  await queryable.execute(sql`insert into public.messaging_outbox (id, event_id, recipient_id, conversation_id, change_sequence, channel, status, attempts, available_at, created_at)
    select gen_random_uuid()::text, ${eventId}, participant.user_id, ${conversationId}, ${change.sequence}::bigint, 'realtime', 'pending', 0, ${now.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz
    from public.messaging_participants participant
    where participant.id in (${change.participant_low_id}, ${change.participant_high_id}) and participant.state = 'active' and participant.user_id is not null`);
  if (kind === "message.created" && messageId) {
    const [message] = rows<{ sender_participant_id: string }>(await queryable.execute(sql`select sender_participant_id from public.messages where id = ${messageId}`));
    const peerParticipantId = message?.sender_participant_id === change.participant_low_id ? change.participant_high_id : change.participant_low_id;
    const [peer] = rows<{ user_id: string | null }>(await queryable.execute(sql`select user_id from public.messaging_participants where id = ${peerParticipantId} and state = 'active'`));
    const peerId = peer?.user_id;
    if (!peerId) return;
    const devices = rows<{ id: string }>(await queryable.execute(sql`
      select d.id from public.push_devices d join public.session s on s.id = d.session_id and s.user_id = d.user_id and s.expires_at > now()
      where d.user_id = ${peerId} and d.opted_in and d.invalidated_at is null and d.token_ciphertext is not null and d.token_key_version is not null
    `));
    for (const device of devices) await queryable.execute(sql`insert into public.messaging_outbox (id, event_id, recipient_id, conversation_id, change_sequence, channel, device_registration_id, status, attempts, available_at, created_at) values (${crypto.randomUUID()}, ${crypto.randomUUID()}, ${peerId}, ${conversationId}, ${change.sequence}::bigint, 'push', ${device.id}, 'pending', 0, ${now.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz)`);
  }
}
