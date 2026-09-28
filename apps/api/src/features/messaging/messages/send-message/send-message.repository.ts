import { createHyperdriveDatabase, lockRelationshipPair, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import type { MessageWriteStore, MessageWriteTransaction, StoredIdempotentMessage } from "../../shared/message-store";
import type { ConversationAccess, StoredMessage } from "../../shared/messaging-types";

type Queryable = Pick<DayliDatabase, "execute">;
type Row = Record<string, unknown>;
const rows = <T extends Row>(value: unknown) => [...value as Iterable<T>];
const number = (value: unknown) => typeof value === "bigint" ? value : BigInt(String(value));

function message(row: Row): StoredMessage {
  return { id: String(row.id), conversationId: String(row.conversation_id), sequence: number(row.sequence), senderId: String(row.sender_id), clientMessageId: String(row.client_message_id), requestFingerprint: String(row.request_fingerprint), body: row.body === null ? null : String(row.body), replyToMessageId: row.reply_to_message_id === null ? null : String(row.reply_to_message_id), version: Number(row.version), createdAt: new Date(String(row.created_at)), editedAt: row.edited_at ? new Date(String(row.edited_at)) : null, unsentAt: row.unsent_at ? new Date(String(row.unsent_at)) : null, reactions: [] };
}

class PostgresMessageTransaction implements MessageWriteTransaction {
  constructor(private readonly queryable: Queryable, private readonly actorId: string, private readonly conversationId: string) {}
  async getAccess(actorId: string, conversationId: string): Promise<ConversationAccess> {
    const [row] = rows<Row>(await this.queryable.execute(sql`
      select c.user_low_id, c.user_high_id, c.request_state,
       exists(select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = ${actorId}) as member,
       exists(select 1 from public.relationship_blocks b where b.unblocked_at is null and ((b.blocker_id = c.user_low_id and b.blocked_id = c.user_high_id) or (b.blocker_id = c.user_high_id and b.blocked_id = c.user_low_id))) as blocked
      from public.conversations c where c.id = ${conversationId} for update
    `));
    if (!row) return { conversationId, peerId: "", requestState: "declined", isMember: false, peerActivityBlocked: false };
    const low = String(row.user_low_id); const high = String(row.user_high_id);
    return { conversationId, peerId: low === actorId ? high : low, requestState: row.request_state as ConversationAccess["requestState"], isMember: row.member === true, peerActivityBlocked: row.blocked === true };
  }
  async findIdempotentMessage(senderId: string, clientMessageId: string): Promise<StoredIdempotentMessage | null> {
    const [row] = rows<Row>(await this.queryable.execute(sql`select * from public.messages where sender_id = ${senderId} and client_message_id = ${clientMessageId}`));
    return row ? { requestFingerprint: String(row.request_fingerprint), message: message(row) } : null;
  }
  async findMessage(conversationId: string, messageId: string): Promise<StoredMessage | null> { const [row] = rows<Row>(await this.queryable.execute(sql`select * from public.messages where conversation_id = ${conversationId} and id = ${messageId}`)); return row ? message(row) : null; }
  async insertMessage(input: Parameters<MessageWriteTransaction["insertMessage"]>[0]): Promise<StoredMessage> {
    const [allocated] = rows<{ sequence: unknown }>(await this.queryable.execute(sql`update public.conversations set last_message_sequence = last_message_sequence + 1, last_activity_at = ${input.createdAt}::timestamptz, updated_at = ${input.createdAt}::timestamptz where id = ${input.conversationId} returning last_message_sequence as sequence`));
    if (!allocated) throw new Error("Conversation disappeared during message insert.");
    const result = await this.queryable.execute(sql`insert into public.messages (id, conversation_id, sequence, sender_id, client_message_id, request_fingerprint, body, reply_to_message_id, version, created_at) values (${input.id}, ${input.conversationId}, ${allocated.sequence}::bigint, ${input.senderId}, ${input.clientMessageId}, ${input.requestFingerprint}, ${input.text}, ${input.replyToMessageId}, 1, ${input.createdAt}::timestamptz) returning *`);
    return message(rows<Row>(result)[0]!);
  }
  async updateMessage(input: Parameters<MessageWriteTransaction["updateMessage"]>[0]): Promise<StoredMessage> {
    const [row] = rows<Row>(await this.queryable.execute(sql`update public.messages set body = ${input.body === undefined ? sql`body` : input.body}, edited_at = ${input.editedAt === undefined ? sql`edited_at` : input.editedAt}::timestamptz, unsent_at = ${input.unsentAt === undefined ? sql`unsent_at` : input.unsentAt}::timestamptz, version = version + 1 where id = ${input.messageId} ${input.expectedVersion === undefined ? sql`` : sql`and version = ${input.expectedVersion}`} returning *`));
    if (!row) throw new Error("Message write conflict.");
    if (input.unsentAt !== undefined) await this.queryable.execute(sql`delete from public.message_reactions where message_id = ${input.messageId}`);
    return message(row);
  }
  async setReaction(messageId: string, actorId: string, reaction: StoredMessage["reactions"][number]["reaction"]): Promise<StoredMessage> {
    await this.queryable.execute(sql`insert into public.message_reactions (message_id, user_id, reaction, created_at) values (${messageId}, ${actorId}, ${reaction}, now()) on conflict (message_id, user_id) do update set reaction = excluded.reaction, created_at = excluded.created_at`);
    const current = await this.findMessage(this.conversationId, messageId); if (!current) throw new Error("Message disappeared during reaction.");
    const result = rows<{ reaction: string; count: number | string; reacted: boolean }>(await this.queryable.execute(sql`select reaction, count(*)::int as count, bool_or(user_id = ${actorId}) as reacted from public.message_reactions where message_id = ${messageId} group by reaction`));
    current.reactions = result.map((row) => ({ reaction: row.reaction as StoredMessage["reactions"][number]["reaction"], count: Number(row.count), reactedByActor: row.reacted })); return current;
  }
  async removeReaction(messageId: string, actorId: string): Promise<StoredMessage> {
    await this.queryable.execute(sql`delete from public.message_reactions where message_id = ${messageId} and user_id = ${actorId}`);
    const current = await this.findMessage(this.conversationId, messageId); if (!current) throw new Error("Message disappeared during reaction."); return current;
  }
  async appendPeerChange(input: Parameters<MessageWriteTransaction["appendPeerChange"]>[0]): Promise<void> {
    const [change] = rows<{ sequence: unknown; user_low_id: string; user_high_id: string }>(await this.queryable.execute(sql`update public.conversations set last_change_sequence = last_change_sequence + 1, updated_at = now() where id = ${input.conversationId} returning last_change_sequence as sequence, user_low_id, user_high_id`));
    if (!change) throw new Error("Conversation disappeared during change append.");
    const eventId = crypto.randomUUID(); const createdAt = new Date().toISOString();
    await this.queryable.execute(sql`insert into public.conversation_changes (conversation_id, change_sequence, kind, message_id, created_at) values (${input.conversationId}, ${change.sequence}::bigint, ${input.kind}, ${input.messageId}, ${createdAt}::timestamptz)`);
    await this.queryable.execute(sql`insert into public.messaging_outbox (id, event_id, recipient_id, conversation_id, change_sequence, channel, status, attempts, available_at, created_at) values (${crypto.randomUUID()}, ${eventId}, ${change.user_low_id}, ${input.conversationId}, ${change.sequence}::bigint, 'realtime', 'pending', 0, ${createdAt}::timestamptz, ${createdAt}::timestamptz), (${crypto.randomUUID()}, ${eventId}, ${change.user_high_id}, ${input.conversationId}, ${change.sequence}::bigint, 'realtime', 'pending', 0, ${createdAt}::timestamptz, ${createdAt}::timestamptz)`);
  }
}

export function createPostgresMessageWriteStore(database: DayliDatabase): MessageWriteStore {
  return { withConversationTransaction: (actorId, conversationId, operation) => database.transaction(async (tx) => {
    const [pair] = rows<{ user_low_id: string; user_high_id: string }>(await tx.execute(sql`select user_low_id, user_high_id from public.conversations where id = ${conversationId}`));
    if (pair) await lockRelationshipPair(tx, pair.user_low_id, pair.user_high_id);
    return operation(new PostgresMessageTransaction(tx, actorId, conversationId));
  }) };
}
export function createHyperdriveMessageWriteStore(hyperdrive: HyperdriveBinding): MessageWriteStore { return { async withConversationTransaction(actorId, conversationId, operation) { const database = createHyperdriveDatabase(hyperdrive); try { return await createPostgresMessageWriteStore(database.db).withConversationTransaction(actorId, conversationId, operation); } finally { await database.close(); } } }; }
