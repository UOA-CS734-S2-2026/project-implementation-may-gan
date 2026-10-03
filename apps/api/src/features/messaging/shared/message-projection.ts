import { and, eq, sql } from "drizzle-orm";
import { schema, type DayliDatabase } from "@dayli/db";
import { requireSafeMessageVersion, requireSafeSequenceBigInt } from "./safe-sequence";
import { participantIdForUser } from "./participant-identity";
import type { MessageDto, StoredMessage } from "./messaging-types";

type Queryable = Pick<DayliDatabase, "select">;

/** Native number-mode row returned by Drizzle message reads. */
export type MessageProjectionRow = {
  id: string;
  conversationId: string;
  sequence: number;
  senderId: string | null;
  senderParticipantId: string | null;
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
  senderParticipantId: schema.messages.senderParticipantId,
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
  const senderId = row.senderParticipantId ?? row.senderId;
  if (!senderId) throw new Error("Message sender identity is missing.");
  return {
    ...row,
    senderId,
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
  const rows = await queryable
    .select({
      reaction: schema.messageReactions.reaction,
      count: sql<number>`count(*) over (partition by ${schema.messageReactions.reaction})::int`,
      reacted: sql<boolean>`bool_or(${schema.messageReactions.participantId} = ${participantIdForUser(actorId)}) over (partition by ${schema.messageReactions.reaction})`,
      id: sql<string>`${schema.messageReactions.participantId}`,
      name: sql<string>`case when ${schema.messagingParticipants.state} = 'active'
          and coalesce(${schema.accountLifecycles.state}, 'active') = 'active'
        then coalesce(nullif(${schema.user.displayUsername}, ''), nullif(${schema.user.username}, ''), ${schema.user.name})
        else 'Deleted account'
      end`,
    })
    .from(schema.messageReactions)
    .leftJoin(schema.messagingParticipants, eq(schema.messagingParticipants.id, schema.messageReactions.participantId))
    .leftJoin(schema.user, eq(schema.user.id, schema.messagingParticipants.userId))
    .leftJoin(schema.accountLifecycles, eq(schema.accountLifecycles.userId, schema.user.id))
    .where(eq(schema.messageReactions.messageId, messageId))
    .orderBy(schema.messageReactions.createdAt);
  const summaries = new Map<StoredMessage["reactions"][number]["reaction"], StoredMessage["reactions"][number]>();
  for (const row of rows) {
    const reaction = row.reaction as StoredMessage["reactions"][number]["reaction"];
    const summary = summaries.get(reaction) ?? {
      reaction,
      count: row.count,
      reactedByActor: row.reacted,
      reactors: [],
    };
    summary.reactors.push({ id: row.id, name: row.name });
    summaries.set(reaction, summary);
  }
  return [...summaries.values()];
}

export async function projectMessageDto(
  queryable: Queryable,
  row: MessageProjectionRow,
  actorId: string,
): Promise<MessageDto> {
  return projectStoredMessageDto(queryable, toStoredMessage(row), actorId);
}
