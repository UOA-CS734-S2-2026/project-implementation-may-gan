import { and, desc, eq, ne, sql } from "drizzle-orm";
import { createHyperdriveDatabase, schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { projectConversationDto } from "../../shared/conversation-projection";
import { MessagingError } from "../../shared/messaging-error";

type Row = Record<string, unknown>;

export interface ListConversationsRepository {
  list(
    actorId: string,
    folder: "inbox" | "requests",
    cursor: string | undefined,
    limit: number,
  ): Promise<{ items: unknown[]; nextCursor: string | null }>;
}

function cursorEncode(row: { cursor_activity: unknown; id: unknown }) {
  return btoa(JSON.stringify([String(row.cursor_activity), String(row.id)]));
}

function cursorDecode(value: string | undefined): [string, string] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(atob(value));
    return Array.isArray(parsed) && typeof parsed[0] === "string" && typeof parsed[1] === "string"
      ? [parsed[0], parsed[1]]
      : null;
  } catch {
    throw new MessagingError("VALIDATION_FAILED");
  }
}

export function createPostgresListConversationsRepository(
  database: DayliDatabase,
): ListConversationsRepository {
  return {
    async list(actorId, folder, rawCursor, limit) {
      const cursor = cursorDecode(rawCursor);
      const state = folder === "inbox" ? "active" : "pending";
      const { conversationMembers, conversations, messages, messagingParticipants, relationshipBlocks, user } = schema;
      const blocked = sql<boolean>`exists(
        select 1
        from ${relationshipBlocks}
        where ${relationshipBlocks.unblockedAt} is null
          and (
            (${relationshipBlocks.blockerId} = ${conversations.participantLowId}
              and ${relationshipBlocks.blockedId} = ${conversations.participantHighId})
            or (${relationshipBlocks.blockerId} = ${conversations.participantHighId}
              and ${relationshipBlocks.blockedId} = ${conversations.participantLowId})
          )
      )`;
      const peerPendingDeletion = sql<boolean>`exists(
        select 1 from ${schema.accountLifecycles}
        where ${schema.accountLifecycles.userId} = ${messagingParticipants.userId}
          and ${schema.accountLifecycles.state} = 'pending_deletion'
      )`;
      const unreadCount = sql<number>`(
        select count(*)::int
        from ${messages}
        where ${messages.conversationId} = ${conversations.id}
          and ${messages.senderParticipantId} <> ${actorId}
          and ${messages.sequence} > ${conversationMembers.lastReadSequence}
          and ${messages.unsentAt} is null
      )`;
      const latestMessage = database
        .select({
          message_id: messages.id,
          message_conversation_id: messages.conversationId,
          message_sequence: sql<string>`${messages.sequence}::text`.as("message_sequence"),
          message_sender_id: messages.senderParticipantId,
          message_client_message_id: messages.clientMessageId,
          message_request_fingerprint: messages.requestFingerprint,
          message_body: messages.body,
          message_reply_to_message_id: messages.replyToMessageId,
          message_version: sql<string>`${messages.version}::text`.as("message_version"),
          message_created_at: messages.createdAt,
          message_edited_at: messages.editedAt,
          message_unsent_at: messages.unsentAt,
        })
        .from(messages)
        .where(eq(messages.conversationId, conversations.id))
        .orderBy(desc(messages.sequence))
        .limit(1)
        .as("latest_message");
      const result = await database
        .select({
          id: conversations.id,
          user_low_id: conversations.participantLowId,
          user_high_id: conversations.participantHighId,
          initiator_id: conversations.initiatorParticipantId,
          request_state: conversations.requestState,
          last_message_sequence: sql<string>`${conversations.lastMessageSequence}::text`,
          last_change_sequence: sql<string>`${conversations.lastChangeSequence}::text`,
          updated_at: conversations.updatedAt,
          cursor_activity: sql<string>`to_char(${conversations.lastActivityAt}, 'YYYY-MM-DD"T"HH24:MI:SS.USOF')`,
          last_read_sequence: sql<string>`${conversationMembers.lastReadSequence}::text`,
          receipt_sequence: sql<string>`${conversationMembers.receiptSequence}::text`,
          peer_id: messagingParticipants.id,
          peer_name: sql<string | null>`case when ${peerPendingDeletion} then null else coalesce(${user.displayUsername}, ${user.username}) end`,
          peer_deleted: sql<boolean>`${messagingParticipants.state} = 'deleted' or ${peerPendingDeletion}`,
          blocked: sql<boolean>`${blocked} or ${peerPendingDeletion}`,
          unread_count: unreadCount,
          message_id: latestMessage.message_id,
          message_conversation_id: latestMessage.message_conversation_id,
          message_sequence: latestMessage.message_sequence,
          message_sender_id: latestMessage.message_sender_id,
          message_client_message_id: latestMessage.message_client_message_id,
          message_request_fingerprint: latestMessage.message_request_fingerprint,
          message_body: latestMessage.message_body,
          message_reply_to_message_id: latestMessage.message_reply_to_message_id,
          message_version: latestMessage.message_version,
          message_created_at: latestMessage.message_created_at,
          message_edited_at: latestMessage.message_edited_at,
          message_unsent_at: latestMessage.message_unsent_at,
        })
        .from(conversations)
        .innerJoin(
          conversationMembers,
          and(
            eq(conversationMembers.conversationId, conversations.id),
            eq(conversationMembers.participantId, actorId),
          ),
        )
        .innerJoin(
          messagingParticipants,
          eq(messagingParticipants.id, sql`case when ${conversations.participantLowId} = ${actorId} then ${conversations.participantHighId} else ${conversations.participantLowId} end`),
        )
        .leftJoin(user, eq(user.id, messagingParticipants.userId))
        .leftJoinLateral(latestMessage, sql`true`)
        .where(and(
          eq(conversations.requestState, state),
          folder === "requests" ? ne(conversations.initiatorParticipantId, actorId) : undefined,
          cursor
            ? sql`(${conversations.lastActivityAt}, ${conversations.id}) < (${cursor[0]}::timestamptz, ${cursor[1]})`
            : undefined,
        ))
        .orderBy(desc(conversations.lastActivityAt), desc(conversations.id))
        .limit(limit + 1);
      const page = result.slice(0, limit);
      return {
        items: await Promise.all(page.map((item) => projectConversationDto(database, item as Row, actorId))),
        nextCursor: result.length > limit ? cursorEncode(page.at(-1)!) : null,
      };
    },
  };
}

export function createHyperdriveListConversationsRepository(
  hyperdrive: HyperdriveBinding,
): ListConversationsRepository {
  return {
    async list(actorId, folder, cursor, limit) {
      const database = createHyperdriveDatabase(hyperdrive);
      try {
        return await createPostgresListConversationsRepository(database.db).list(
          actorId,
          folder,
          cursor,
          limit,
        );
      } finally {
        await database.close();
      }
    },
  };
}
