import { and, count, eq, sql } from "drizzle-orm";
import { schema, type DayliDatabase } from "@dayli/db";
import { requireSafeMessageVersion, requireSafeSequenceBigInt } from "./safe-sequence";
import type { MessageDto, StoredMessage } from "./messaging-types";

type Queryable = Pick<DayliDatabase, "select">;

/** Native number-mode row returned by Drizzle message reads. */
export type MessageProjectionRow = {
  id: string;
  conversationId: string;
  sequence: number;
  senderId: string;
  clientMessageId: string;
  requestFingerprint: string;
  body: string | null;
  replyToMessageId: string | null;
  version: number;
  createdAt: Date;
  editedAt: Date | null;
  unsentAt: Date | null;
};

/** Shared native selection for message DTO reads and reply lookups. */
export const messageProjectionSelection = {
  id: schema.messages.id,
  conversationId: schema.messages.conversationId,
  sequence: schema.messages.sequence,
  senderId: schema.messages.senderId,
  clientMessageId: schema.messages.clientMessageId,
  requestFingerprint: schema.messages.requestFingerprint,
  body: schema.messages.body,
  replyToMessageId: schema.messages.replyToMessageId,
  version: schema.messages.version,
  createdAt: schema.messages.createdAt,
  editedAt: schema.messages.editedAt,
  unsentAt: schema.messages.unsentAt,
};

/** Validates and converts a native Drizzle message row to the internal model. */
export function toStoredMessage(row: MessageProjectionRow): StoredMessage {
  return {
    ...row,
    sequence: requireSafeSequenceBigInt(row.sequence),
    version: requireSafeMessageVersion(row.version),
    reactions: [],
  };
}

/**
 * Canonical projection. Tombstones expose stable ordering metadata but never a
 * former body or copied reply text.
 */
export function toMessageDto(message: StoredMessage, parent?: StoredMessage | null): MessageDto {
  const replyPreview = message.replyToMessageId && parent
    ? {
        id: parent.id,
        senderId: parent.senderId,
        text: parent.unsentAt ? null : parent.body,
        unsentAt: parent.unsentAt?.toISOString() ?? null,
      }
    : null;
  return {
    id: message.id,
    conversationId: message.conversationId,
    sequence: message.sequence.toString(),
    senderId: message.senderId,
    clientMessageId: message.clientMessageId,
    text: message.unsentAt ? null : message.body,
    replyToMessageId: message.replyToMessageId,
    replyPreview,
    version: message.version,
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt?.toISOString() ?? null,
    unsentAt: message.unsentAt?.toISOString() ?? null,
    reactions: message.unsentAt ? [] : message.reactions,
  };
}

async function projectStoredMessageDto(
  queryable: Queryable,
  message: StoredMessage,
  actorId: string,
): Promise<MessageDto> {
  const parent = message.replyToMessageId
    ? (await queryable
      .select(messageProjectionSelection)
      .from(schema.messages)
      .where(and(
        eq(schema.messages.id, message.replyToMessageId),
        eq(schema.messages.conversationId, message.conversationId),
      ))
      .limit(1))[0]
    : undefined;
  message.reactions = await loadReactionSummaries(queryable, message.id, actorId);
  return toMessageDto(message, parent ? toStoredMessage(parent) : null);
}

/** Resolves the shared reply and actor-specific reaction portions of a message DTO. */
export async function loadReactionSummaries(queryable: Queryable, messageId: string, actorId: string): Promise<StoredMessage["reactions"]> {
  const reactions = await queryable
    .select({
      reaction: schema.messageReactions.reaction,
      count: count(),
      reacted: sql<boolean>`bool_or(${schema.messageReactions.userId} = ${actorId})`,
    })
    .from(schema.messageReactions)
    .where(eq(schema.messageReactions.messageId, messageId))
    .groupBy(schema.messageReactions.reaction);
  const reactors = await queryable
    .select({
      reaction: schema.messageReactions.reaction,
      id: schema.user.id,
      name: sql<string>`coalesce(nullif(${schema.user.displayUsername}, ''), nullif(${schema.user.username}, ''), ${schema.user.name})`,
    })
    .from(schema.messageReactions)
    .innerJoin(schema.user, eq(schema.user.id, schema.messageReactions.userId))
    .where(eq(schema.messageReactions.messageId, messageId))
    .orderBy(schema.messageReactions.createdAt);
  return reactions.map((item) => ({
    reaction: item.reaction as StoredMessage["reactions"][number]["reaction"],
    count: item.count,
    reactedByActor: item.reacted,
    reactors: reactors.filter((reactor) => reactor.reaction === item.reaction).map((reactor) => ({ id: reactor.id, name: reactor.name })),
  }));
}

export async function projectMessageDto(
  queryable: Queryable,
  row: MessageProjectionRow,
  actorId: string,
): Promise<MessageDto> {
  return projectStoredMessageDto(queryable, toStoredMessage(row), actorId);
}
