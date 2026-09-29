import { createHyperdriveDatabase, lockRelationshipPair, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { appendConversationChange } from "../../shared/append-conversation-change";
import { MessagingError } from "../../shared/messaging-error";
import { requireConversationMember } from "../../shared/require-conversation-member";

type Row = Record<string, unknown>;
const rows = <T extends Row>(value: unknown) => [...value as Iterable<T>];
const bigint = (value: unknown) => typeof value === "bigint" ? value : BigInt(String(value));

export interface MarkConversationReadRepository {
  markRead(
    actorId: string,
    conversationId: string,
    throughSequence: string,
  ): Promise<{ lastReadSequence: string; receiptSequence: string; unreadCount: number }>;
}

export function createPostgresMarkConversationReadRepository(
  database: DayliDatabase,
): MarkConversationReadRepository {
  return {
    async markRead(actorId, conversationId, through) {
      return database.transaction(async (tx) => {
        const [pair] = rows<Row>(await tx.execute(sql`select user_low_id, user_high_id from public.conversations where id = ${conversationId}`));
        if (!pair) throw new MessagingError("NOT_FOUND");
        await lockRelationshipPair(tx, String(pair.user_low_id), String(pair.user_high_id));
        const row = await requireConversationMember(tx, actorId, conversationId, true);
        const max = bigint(row.last_message_sequence);
        const target = bigint(through) > max ? max : bigint(through);
        const allowedReceipt = row.request_state === "active" && row.blocked !== true;
        const [updated] = rows<Row>(await tx.execute(sql`update public.conversation_members set last_read_sequence = greatest(last_read_sequence, ${target}::bigint), receipt_sequence = ${allowedReceipt ? sql`greatest(receipt_sequence, ${target}::bigint)` : sql`receipt_sequence`}, updated_at = now() where conversation_id = ${conversationId} and user_id = ${actorId} returning last_read_sequence, receipt_sequence`));
        if (allowedReceipt) await appendConversationChange(tx, conversationId, "read.updated", null, actorId, new Date());
        const [unread] = rows<{ count: number }>(await tx.execute(sql`select count(*)::int as count from public.messages where conversation_id = ${conversationId} and sender_id <> ${actorId} and sequence > ${updated!.last_read_sequence}::bigint and unsent_at is null`));
        return { lastReadSequence: String(updated!.last_read_sequence), receiptSequence: String(updated!.receipt_sequence), unreadCount: unread?.count ?? 0 };
      });
    },
  };
}

export function createHyperdriveMarkConversationReadRepository(
  hyperdrive: HyperdriveBinding,
): MarkConversationReadRepository {
  return {
    async markRead(actorId, conversationId, throughSequence) {
      const database = createHyperdriveDatabase(hyperdrive);
      try {
        return await createPostgresMarkConversationReadRepository(database.db).markRead(
          actorId,
          conversationId,
          throughSequence,
        );
      } finally {
        await database.close();
      }
    },
  };
}
