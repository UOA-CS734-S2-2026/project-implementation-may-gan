import { createHyperdriveDatabase, lockRelationshipPair, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { appendConversationChange } from "./append-conversation-change";
import type {
  DirectConversation,
  DirectConversationStore,
  DirectConversationTransaction,
  ConversationReader,
} from "./conversation-types";
import { MessagingError } from "./messaging-error";
import { projectConversationDto } from "./conversation-projection";
import type { StoredMessage } from "./messaging-types";
import { requireConversationMember as requireConversation } from "./require-conversation-member";

type Row = Record<string, unknown>;
type Queryable = Pick<DayliDatabase, "execute">;
const rows = <T extends Row>(value: unknown) => [...value as Iterable<T>];
const bigint = (value: unknown) => typeof value === "bigint" ? value : BigInt(String(value));
const date = (value: unknown) => new Date(String(value));

function storedMessage(row: Row): StoredMessage {
  return { id: String(row.id), conversationId: String(row.conversation_id), sequence: bigint(row.sequence), senderId: String(row.sender_id), clientMessageId: String(row.client_message_id), requestFingerprint: String(row.request_fingerprint), body: row.body === null ? null : String(row.body), replyToMessageId: row.reply_to_message_id === null ? null : String(row.reply_to_message_id), version: Number(row.version), createdAt: date(row.created_at), editedAt: row.edited_at ? date(row.edited_at) : null, unsentAt: row.unsent_at ? date(row.unsent_at) : null, reactions: [] };
}
function direct(row: Row, actorId: string): DirectConversation {
  const low = String(row.user_low_id); const high = String(row.user_high_id);
  return { id: String(row.id), peerId: low === actorId ? high : low, requestState: row.request_state as DirectConversation["requestState"] };
}
class PostgresDirectTransaction implements DirectConversationTransaction {
  constructor(private readonly queryable: Queryable, private readonly actorId: string, private readonly recipientId: string) {}
  async isPairBlocked(actorId: string, recipientId: string): Promise<boolean> { const [row] = rows<{ blocked: boolean }>(await this.queryable.execute(sql`select exists(select 1 from public.relationship_blocks where unblocked_at is null and ((blocker_id = ${actorId} and blocked_id = ${recipientId}) or (blocker_id = ${recipientId} and blocked_id = ${actorId}))) as blocked`)); return row?.blocked === true; }
  async findDirectConversation(actorId: string, recipientId: string): Promise<DirectConversation | null> { const [row] = rows<Row>(await this.queryable.execute(sql`select * from public.conversations where user_low_id = least(${actorId}, ${recipientId}) and user_high_id = greatest(${actorId}, ${recipientId}) for update`)); return row ? direct(row, actorId) : null; }
  async recipientExists(recipientId: string): Promise<boolean> { const [row] = rows<Row>(await this.queryable.execute(sql`select id from public.user where id = ${recipientId}`)); return Boolean(row); }
  async hasActiveFriendship(actorId: string, recipientId: string): Promise<boolean> { const [row] = rows<{ active: boolean }>(await this.queryable.execute(sql`select exists(select 1 from public.friendships where user_id = ${actorId} and friend_id = ${recipientId} and state = 'active') as active`)); return row?.active === true; }
  async findIdempotentMessage(senderId: string, clientMessageId: string) { const [row] = rows<Row>(await this.queryable.execute(sql`select m.*, c.id as direct_conversation_id, c.user_low_id, c.user_high_id, c.request_state from public.messages m join public.conversations c on c.id = m.conversation_id where m.sender_id = ${senderId} and m.client_message_id = ${clientMessageId}`)); if (!row) return null; const low = String(row.user_low_id); return { requestFingerprint: String(row.request_fingerprint), conversation: { id: String(row.direct_conversation_id), peerId: low === senderId ? String(row.user_high_id) : low, requestState: row.request_state as DirectConversation["requestState"] }, message: storedMessage(row) }; }
  async activateConversation(conversation: DirectConversation, now: Date): Promise<DirectConversation> { await this.queryable.execute(sql`update public.conversations set request_state = 'active', updated_at = ${now.toISOString()}::timestamptz where id = ${conversation.id}`); await appendConversationChange(this.queryable, conversation.id, "request.active", null, null, now); return { ...conversation, requestState: "active" }; }
  async createConversationWithMessage(input: Parameters<DirectConversationTransaction["createConversationWithMessage"]>[0]) { const low = input.initiatorId < input.recipientId ? input.initiatorId : input.recipientId; const high = input.initiatorId < input.recipientId ? input.recipientId : input.initiatorId;
    await this.queryable.execute(sql`insert into public.conversations (id, kind, user_low_id, user_high_id, initiator_id, request_state, last_message_sequence, last_change_sequence, last_activity_at, created_at, updated_at) values (${input.conversationId}, 'direct', ${low}, ${high}, ${input.initiatorId}, ${input.requestState}, 1, 0, ${input.createdAt.toISOString()}::timestamptz, ${input.createdAt.toISOString()}::timestamptz, ${input.createdAt.toISOString()}::timestamptz)`);
    await this.queryable.execute(sql`insert into public.conversation_members (conversation_id, user_id, last_read_sequence, receipt_sequence, created_at, updated_at) values (${input.conversationId}, ${input.initiatorId}, 0, 0, ${input.createdAt.toISOString()}::timestamptz, ${input.createdAt.toISOString()}::timestamptz), (${input.conversationId}, ${input.recipientId}, 0, 0, ${input.createdAt.toISOString()}::timestamptz, ${input.createdAt.toISOString()}::timestamptz)`);
    const [messageRow] = rows<Row>(await this.queryable.execute(sql`insert into public.messages (id, conversation_id, sequence, sender_id, client_message_id, request_fingerprint, body, version, created_at) values (${input.messageId}, ${input.conversationId}, 1, ${input.initiatorId}, ${input.clientMessageId}, ${input.requestFingerprint}, ${input.text}, 1, ${input.createdAt.toISOString()}::timestamptz) returning *`));
    await appendConversationChange(this.queryable, input.conversationId, "message.created", input.messageId, null, input.createdAt);
    return { conversation: { id: input.conversationId, peerId: input.recipientId, requestState: input.requestState }, message: storedMessage(messageRow!) };
  }
  async appendExistingMessage(input: Parameters<DirectConversationTransaction["appendExistingMessage"]>[0]): Promise<StoredMessage> { const [allocated] = rows<{ sequence: unknown }>(await this.queryable.execute(sql`update public.conversations set last_message_sequence = last_message_sequence + 1, last_activity_at = ${input.createdAt.toISOString()}::timestamptz, updated_at = ${input.createdAt.toISOString()}::timestamptz where id = ${input.conversation.id} returning last_message_sequence as sequence`)); const [row] = rows<Row>(await this.queryable.execute(sql`insert into public.messages (id, conversation_id, sequence, sender_id, client_message_id, request_fingerprint, body, version, created_at) values (${input.messageId}, ${input.conversation.id}, ${allocated!.sequence}::bigint, ${input.senderId}, ${input.clientMessageId}, ${input.requestFingerprint}, ${input.text}, 1, ${input.createdAt.toISOString()}::timestamptz) returning *`)); await appendConversationChange(this.queryable, input.conversation.id, "message.created", input.messageId, null, input.createdAt); return storedMessage(row!); }
}

export function createPostgresDirectConversationStore(database: DayliDatabase): DirectConversationStore { return { withDirectTransaction: (actorId, recipientId, action) => database.transaction(async (tx) => { await lockRelationshipPair(tx, actorId, recipientId); return action(new PostgresDirectTransaction(tx, actorId, recipientId)); }) }; }
export function createHyperdriveDirectConversationStore(hyperdrive: HyperdriveBinding): DirectConversationStore { return { async withDirectTransaction(actor, recipient, action) { const database = createHyperdriveDatabase(hyperdrive); try { return await createPostgresDirectConversationStore(database.db).withDirectTransaction(actor, recipient, action); } finally { await database.close(); } } }; }

async function conversationAfterResolution(database: DayliDatabase, actorId: string, conversationId: string) {
  const row = await requireConversation(database, actorId, conversationId);
  const peer = String(row.user_low_id) === actorId ? String(row.user_high_id) : String(row.user_low_id);
  const [user] = rows<Row>(await database.execute(sql`select id, coalesce(display_username, username) as name from public.user where id = ${peer}`));
  const [latest] = rows<Row>(await database.execute(sql`select * from public.messages where conversation_id = ${conversationId} order by sequence desc limit 1`));
  const unread = rows<{ count: number }>(await database.execute(sql`select count(*)::int as count from public.messages where conversation_id = ${conversationId} and sender_id <> ${actorId} and sequence > ${row.last_read_sequence}::bigint and unsent_at is null`))[0]?.count ?? 0;
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
export function createPostgresConversationReader(database: DayliDatabase): ConversationReader { return {
 async resolve(actorId, conversationId, decision) { await database.transaction(async (tx) => { const [pair] = rows<Row>(await tx.execute(sql`select user_low_id, user_high_id from public.conversations where id = ${conversationId}`)); if (!pair) throw new MessagingError("NOT_FOUND"); await lockRelationshipPair(tx, String(pair.user_low_id), String(pair.user_high_id)); const row = await requireConversation(tx, actorId, conversationId, true); if (row.blocked === true) throw new MessagingError("BLOCKED"); const state = decision === "accept" ? "active" : "declined"; if (String(row.initiator_id) === actorId) throw new MessagingError("FORBIDDEN"); if (row.request_state === state) return; if (row.request_state !== "pending") throw new MessagingError("FORBIDDEN"); await tx.execute(sql`update public.conversations set request_state = ${state}, updated_at = now() where id = ${conversationId}`); await appendConversationChange(tx, conversationId, `request.${state}`, null, actorId, new Date()); }); return conversationAfterResolution(database, actorId, conversationId); },
 }; }
export function createHyperdriveConversationReader(hyperdrive: HyperdriveBinding): ConversationReader { const withDatabase = async <T>(run: (database: DayliDatabase) => Promise<T>) => { const database = createHyperdriveDatabase(hyperdrive); try { return await run(database.db); } finally { await database.close(); } }; return new Proxy({} as ConversationReader, { get: (_target, property) => (...args: unknown[]) => withDatabase((database) => (createPostgresConversationReader(database) as unknown as Record<string, (...values: unknown[]) => Promise<unknown>>)[String(property)]!(...args)) }); }
