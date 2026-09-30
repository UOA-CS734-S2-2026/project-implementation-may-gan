import { schema, sql } from "@dayli/db";
import { and, eq } from "drizzle-orm";
import { messageProjectionSelection, toStoredMessage } from "../../shared/message-projection";
import { type MessageWriteQueryable } from "./message-write-primitives";
import type { StoredMessage } from "../../shared/messaging-types";

export interface UpdateMessageRowInput {
  messageId: string;
  body?: string | null;
  editedAt?: Date | null;
  unsentAt?: Date | null;
  expectedVersion?: number;
}

/** Updates a message row inside the caller's already locked transaction. */
export async function updateMessageRow(
  queryable: MessageWriteQueryable,
  input: UpdateMessageRowInput,
): Promise<StoredMessage> {
  const [row] = await queryable
    .update(schema.messages)
    .set({
      body: input.body === undefined ? schema.messages.body : input.body,
      editedAt: input.editedAt === undefined ? schema.messages.editedAt : input.editedAt,
      unsentAt: input.unsentAt === undefined ? schema.messages.unsentAt : input.unsentAt,
      version: sql`${schema.messages.version} + 1`,
    })
    .where(and(
      eq(schema.messages.id, input.messageId),
      input.expectedVersion === undefined ? undefined : eq(schema.messages.version, input.expectedVersion),
    ))
    .returning(messageProjectionSelection);
  if (!row) throw new Error("Message write conflict.");
  const message = toStoredMessage(row);
  if (input.unsentAt !== undefined) {
    await queryable.delete(schema.messageReactions).where(eq(schema.messageReactions.messageId, input.messageId));
  }
  return message;
}
