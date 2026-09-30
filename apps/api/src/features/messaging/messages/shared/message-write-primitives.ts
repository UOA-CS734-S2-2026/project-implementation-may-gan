import { sql, type DayliDatabase } from "@dayli/db";
import type { ConversationAccess, ConversationPeerChange, StoredMessage } from "../../shared/messaging-types";

export type MessageWriteQueryable = Pick<DayliDatabase, "delete" | "execute" | "insert" | "select" | "update">;
type Row = Record<string, unknown>;
const rows = <T extends Row>(value: unknown) => [...value as Iterable<T>];
const number = (value: unknown) => typeof value === "bigint" ? value : BigInt(String(value));

export function mapStoredMessage(row: Row): StoredMessage {
  return { id: String(row.id), conversationId: String(row.conversation_id), sequence: number(row.sequence), senderId: String(row.sender_id), clientMessageId: String(row.client_message_id), requestFingerprint: String(row.request_fingerprint), body: row.body === null ? null : String(row.body), replyToMessageId: row.reply_to_message_id === null ? null : String(row.reply_to_message_id), version: Number(row.version), createdAt: new Date(String(row.created_at)), editedAt: row.edited_at ? new Date(String(row.edited_at)) : null, unsentAt: row.unsent_at ? new Date(String(row.unsent_at)) : null, reactions: [] };
}

export async function getAccess(queryable: MessageWriteQueryable, actorId: string, conversationId: string): Promise<ConversationAccess> {
  const [row] = rows<Row>(await queryable.execute(sql`
    select c.user_low_id, c.user_high_id, c.request_state,
     exists(select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = ${actorId}) as member,
     exists(select 1 from public.relationship_blocks b where b.unblocked_at is null and ((b.blocker_id = c.user_low_id and b.blocked_id = c.user_high_id) or (b.blocker_id = c.user_high_id and b.blocked_id = c.user_low_id))) as blocked
    from public.conversations c where c.id = ${conversationId} for update
  `));
  if (!row) return { conversationId, peerId: "", requestState: "declined", isMember: false, peerActivityBlocked: false };
  const low = String(row.user_low_id); const high = String(row.user_high_id);
  return { conversationId, peerId: low === actorId ? high : low, requestState: row.request_state as ConversationAccess["requestState"], isMember: row.member === true, peerActivityBlocked: row.blocked === true };
}

export async function findMessage(queryable: MessageWriteQueryable, actorId: string, conversationId: string, messageId: string): Promise<StoredMessage | null> {
  const [row] = rows<Row>(await queryable.execute(sql`select * from public.messages where conversation_id = ${conversationId} and id = ${messageId}`));
  if (!row) return null;
  const stored = mapStoredMessage(row);
  const reactionRows = rows<{ reaction: string; count: number | string; reacted: boolean }>(await queryable.execute(sql`select reaction, count(*)::int as count, bool_or(user_id = ${actorId}) as reacted from public.message_reactions where message_id = ${messageId} group by reaction`));
  stored.reactions = reactionRows.map((item) => ({ reaction: item.reaction as StoredMessage["reactions"][number]["reaction"], count: Number(item.count), reactedByActor: item.reacted }));
  return stored;
}

export async function appendPeerChange(queryable: MessageWriteQueryable, input: ConversationPeerChange): Promise<void> {
  const [change] = rows<{ sequence: unknown; user_low_id: string; user_high_id: string }>(await queryable.execute(sql`update public.conversations set last_change_sequence = last_change_sequence + 1, updated_at = now() where id = ${input.conversationId} returning last_change_sequence as sequence, user_low_id, user_high_id`));
  if (!change) throw new Error("Conversation disappeared during change append.");
  const eventId = crypto.randomUUID(); const createdAt = new Date().toISOString();
  await queryable.execute(sql`insert into public.conversation_changes (conversation_id, change_sequence, kind, message_id, created_at) values (${input.conversationId}, ${change.sequence}::bigint, ${input.kind}, ${input.messageId}, ${createdAt}::timestamptz)`);
  await queryable.execute(sql`insert into public.messaging_outbox (id, event_id, recipient_id, conversation_id, change_sequence, channel, status, attempts, available_at, created_at) values (${crypto.randomUUID()}, ${eventId}, ${change.user_low_id}, ${input.conversationId}, ${change.sequence}::bigint, 'realtime', 'pending', 0, ${createdAt}::timestamptz, ${createdAt}::timestamptz), (${crypto.randomUUID()}, ${eventId}, ${change.user_high_id}, ${input.conversationId}, ${change.sequence}::bigint, 'realtime', 'pending', 0, ${createdAt}::timestamptz, ${createdAt}::timestamptz)`);
  if (input.kind === "message.created" && input.messageId) {
    const [message] = rows<{ sender_id: string }>(await queryable.execute(sql`select sender_id from public.messages where id = ${input.messageId}`));
    const peerId = message?.sender_id === change.user_low_id ? change.user_high_id : change.user_low_id;
    const devices = rows<{ id: string }>(await queryable.execute(sql`
      select d.id from public.push_devices d join public.session s on s.id = d.session_id and s.user_id = d.user_id and s.expires_at > now()
      where d.user_id = ${peerId} and d.opted_in and d.invalidated_at is null and d.token_ciphertext is not null and d.token_key_version is not null
    `));
    for (const device of devices) await queryable.execute(sql`insert into public.messaging_outbox (id, event_id, recipient_id, conversation_id, change_sequence, channel, device_registration_id, status, attempts, available_at, created_at) values (${crypto.randomUUID()}, ${crypto.randomUUID()}, ${peerId}, ${input.conversationId}, ${change.sequence}::bigint, 'push', ${device.id}, 'pending', 0, ${createdAt}::timestamptz, ${createdAt}::timestamptz)`);
  }
}
