import { and, count, desc, eq, exists, gt, isNull, ne, or, sql } from "drizzle-orm";
import { createHyperdriveDatabase, schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { projectConversationDto } from "../../shared/conversation-projection";
import { messageProjectionSelection } from "../../shared/message-projection";
import { MessagingError } from "../../shared/messaging-error";

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
      const { conversationMembers, conversations, messages, relationshipBlocks, user } = schema;
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
          ne(messages.senderId, actorId),
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
          request_state: conversations.requestState,
          last_message_sequence: conversations.lastMessageSequence,
          last_change_sequence: conversations.lastChangeSequence,
          updated_at: conversations.updatedAt,
          cursor_activity: sql<string>`to_char(${conversations.lastActivityAt}, 'YYYY-MM-DD"T"HH24:MI:SS.USOF')`,
          last_read_sequence: conversationMembers.lastReadSequence,
          receipt_sequence: conversationMembers.receiptSequence,
          peer_id: user.id,
          peer_name: sql<string | null>`coalesce(${user.displayUsername}, ${user.username})`,
          blocked,
          unread_count: unreadCount,
          latestMessage: {
            id: latestMessage.id,
            conversationId: latestMessage.conversationId,
            sequence: latestMessage.sequence,
            senderId: latestMessage.senderId,
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
            eq(conversationMembers.userId, actorId),
          ),
        )
        .innerJoin(
          user,
          eq(user.id, sql`case when ${conversations.userLowId} = ${actorId} then ${conversations.userHighId} else ${conversations.userLowId} end`),
        )
        .leftJoinLateral(latestMessage, sql`true`)
        .where(and(
          eq(conversations.requestState, state),
          folder === "requests" ? ne(conversations.initiatorId, actorId) : undefined,
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
