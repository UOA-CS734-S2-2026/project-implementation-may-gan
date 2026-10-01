import { and, count, desc, eq, exists, gt, isNull, ne, or, sql } from "drizzle-orm";
import { createHyperdriveDatabase, schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { projectConversationDto } from "../../shared/conversation-projection";
import { messageProjectionSelection } from "../../shared/message-projection";
import { MessagingError } from "../../shared/messaging-error";
import { participantIdForUser } from "../../shared/participant-identity";

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
      const blocked = exists(
        database
          .select({ blockerId: relationshipBlocks.blockerId })
          .from(relationshipBlocks)
          .where(and(
            isNull(relationshipBlocks.unblockedAt),
            or(
              and(
                eq(relationshipBlocks.blockerId, conversations.userLowId),
                eq(relationshipBlocks.blockedId, conversations.userHighId),
              ),
              and(
                eq(relationshipBlocks.blockerId, conversations.userHighId),
                eq(relationshipBlocks.blockedId, conversations.userLowId),
              ),
            ),
          )),
      ).mapWith(Boolean);
      const unreadCount = database
        .select({ count: count().as("count") })
        .from(messages)
        .where(and(
          eq(messages.conversationId, conversations.id),
          ne(messages.senderParticipantId, participantIdForUser(actorId)),
          gt(messages.sequence, conversationMembers.lastReadSequence),
          isNull(messages.unsentAt),
        ))
        .as("unread_count");
      const latestMessage = database
        .select(messageProjectionSelection)
        .from(messages)
        .where(eq(messages.conversationId, conversations.id))
        .orderBy(desc(messages.sequence))
        .limit(1)
        .as("latest_message");
      const result = await database
        .select({
          id: conversations.id,
          user_low_id: conversations.userLowId,
          user_high_id: conversations.userHighId,
          initiator_id: conversations.initiatorId,
          initiator_participant_id: conversations.initiatorParticipantId,
          member_participant_id: conversationMembers.participantId,
          request_state: conversations.requestState,
          last_message_sequence: conversations.lastMessageSequence,
          last_change_sequence: conversations.lastChangeSequence,
          updated_at: conversations.updatedAt,
          cursor_activity: sql<string>`to_char(${conversations.lastActivityAt}, 'YYYY-MM-DD"T"HH24:MI:SS.USOF')`,
          last_read_sequence: conversationMembers.lastReadSequence,
          receipt_sequence: conversationMembers.receiptSequence,
          peer_id: messagingParticipants.id,
          peer_name: sql<string | null>`case when ${messagingParticipants.state} = 'active'
              and coalesce(${schema.accountLifecycles.state}, 'active') = 'active'
            then coalesce(nullif(${user.displayUsername}, ''), nullif(${user.username}, ''))
            else 'Deleted account'
          end`,
          peer_deleted: sql<boolean>`${messagingParticipants.state} = 'deleted'`,
          blocked,
          unread_count: unreadCount,
          latestMessage: {
            id: latestMessage.id,
            conversationId: latestMessage.conversationId,
            sequence: latestMessage.sequence,
            senderId: latestMessage.senderId,
            senderParticipantId: latestMessage.senderParticipantId,
            clientMessageId: latestMessage.clientMessageId,
            requestFingerprint: latestMessage.requestFingerprint,
            body: latestMessage.body,
            replyToMessageId: latestMessage.replyToMessageId,
            version: latestMessage.version,
            createdAt: latestMessage.createdAt,
            editedAt: latestMessage.editedAt,
            unsentAt: latestMessage.unsentAt,
          },
        })
        .from(conversations)
        .innerJoin(
          conversationMembers,
          and(
            eq(conversationMembers.conversationId, conversations.id),
            eq(conversationMembers.participantId, participantIdForUser(actorId)),
          ),
        )
        .innerJoin(
          messagingParticipants,
          eq(messagingParticipants.id, sql`case when ${conversations.participantLowId} = ${participantIdForUser(actorId)} then ${conversations.participantHighId} else ${conversations.participantLowId} end`),
        )
        .leftJoin(user, eq(user.id, messagingParticipants.userId))
        .leftJoin(schema.accountLifecycles, eq(schema.accountLifecycles.userId, user.id))
        .leftJoinLateral(latestMessage, sql`true`)
        .where(and(
          eq(conversations.requestState, state),
          folder === "requests" ? ne(conversations.initiatorParticipantId, participantIdForUser(actorId)) : undefined,
          cursor
            ? sql`(${conversations.lastActivityAt}, ${conversations.id}) < (${cursor[0]}::timestamptz, ${cursor[1]})`
            : undefined,
        ))
        .orderBy(desc(conversations.lastActivityAt), desc(conversations.id))
        .limit(limit + 1);
      const page = result.slice(0, limit);
      return {
        items: await Promise.all(page.map((item) => projectConversationDto(database, item, actorId))),
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
