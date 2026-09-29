import { sql } from "@dayli/db";
import { mapStoredMessage, type MessageWriteQueryable } from "./message-write-primitives";
import type { MessageWriteTransaction } from "../../shared/message-store";
import type { StoredMessage } from "../../shared/messaging-types";

type Row = Record<string, unknown>;
const rows = <T extends Row>(value: unknown) => [...value as Iterable<T>];

/** Updates a message row inside the caller's already locked transaction. */
export async function updateMessageRow(
  queryable: MessageWriteQueryable,
  input: Parameters<MessageWriteTransaction["updateMessage"]>[0],
): Promise<StoredMessage> {
  const [row] = rows<Row>(await queryable.execute(sql`update public.messages set body = ${input.body === undefined ? sql`body` : input.body}, edited_at = ${input.editedAt === undefined ? sql`edited_at` : input.editedAt?.toISOString() ?? null}::timestamptz, unsent_at = ${input.unsentAt === undefined ? sql`unsent_at` : input.unsentAt?.toISOString() ?? null}::timestamptz, version = version + 1 where id = ${input.messageId} ${input.expectedVersion === undefined ? sql`` : sql`and version = ${input.expectedVersion}`} returning *`));
  if (!row) throw new Error("Message write conflict.");
  if (input.unsentAt !== undefined) await queryable.execute(sql`delete from public.message_reactions where message_id = ${input.messageId}`);
  return mapStoredMessage(row);
}
