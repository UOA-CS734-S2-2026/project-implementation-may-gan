import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { createHyperdriveDatabase, schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { projectConversationDto } from "../../shared/conversation-projection";
import { requireConversationMember } from "../../shared/require-conversation-member";

type Row = Record<string, unknown>;

type MessageLookup = {
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

export interface GetConversationRepository {
  get(actorId: string, conversationId: string): Promise<unknown>;
}

export function createPostgresGetConversationRepository(database: DayliDatabase): GetConversationRepository {
  return {
    async get(actorId, conversationId) {
      const row = await requireConversationMember(database, actorId, conversationId);
      const peer = String(row.user_low_id) === actorId ? String(row.user_high_id) : String(row.user_low_id);
      const [participant] = await database
        .select({ state: schema.messagingParticipants.state, userId: schema.messagingParticipants.userId })
        .from(schema.messagingParticipants)
        .where(eq(schema.messagingParticipants.id, peer))
        .limit(1);
      const [user] = participant?.userId
        ? await database
          .select({
            name: sql<string | null>`coalesce(${schema.user.displayUsername}, ${schema.user.username})`,
            pendingDeletion: sql<boolean>`exists(
              select 1 from ${schema.accountLifecycles}
              where ${schema.accountLifecycles.userId} = ${schema.user.id}
                and ${schema.accountLifecycles.state} = 'pending_deletion'
            )`,
          })
          .from(schema.user)
          .where(eq(schema.user.id, participant.userId))
          .limit(1)
        : [];
      const [latest] = await database
        .select({
          id: schema.messages.id,
          conversationId: schema.messages.conversationId,
          sequence: schema.messages.sequence,
          senderId: schema.messages.senderParticipantId,
          clientMessageId: schema.messages.clientMessageId,
          requestFingerprint: schema.messages.requestFingerprint,
          body: schema.messages.body,
          replyToMessageId: schema.messages.replyToMessageId,
          version: schema.messages.version,
          createdAt: schema.messages.createdAt,
          editedAt: schema.messages.editedAt,
          unsentAt: schema.messages.unsentAt,
        })
        .from(schema.messages)
        .where(eq(schema.messages.conversationId, conversationId))
        .orderBy(desc(schema.messages.sequence))
        .limit(1);
      const [unread] = await database
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.messages)
        .where(and(
          eq(schema.messages.conversationId, conversationId),
          ne(schema.messages.senderParticipantId, actorId),
          sql`${schema.messages.sequence} > ${String(row.last_read_sequence)}::bigint`,
          isNull(schema.messages.unsentAt),
        ));
      return projectConversationDto(database, {
        ...row,
        peer_id: peer,
        peer_name: user?.pendingDeletion ? null : user?.name,
        peer_deleted: participant?.state === "deleted" || user?.pendingDeletion === true,
        unread_count: unread?.count ?? 0,
        ...(latest ? messageProjection(latest) : {}),
      }, actorId);
    },
  };
}

function messageProjection(message: MessageLookup): Row {
  return {
    message_id: message.id,
    message_conversation_id: message.conversationId,
    message_sequence: message.sequence,
    message_sender_id: message.senderId,
    message_client_message_id: message.clientMessageId,
    message_request_fingerprint: message.requestFingerprint,
    message_body: message.body,
    message_reply_to_message_id: message.replyToMessageId,
    message_version: message.version,
    message_created_at: message.createdAt,
    message_edited_at: message.editedAt,
    message_unsent_at: message.unsentAt,
  };
}

export function createHyperdriveGetConversationRepository(hyperdrive: HyperdriveBinding): GetConversationRepository {
  return {
    async get(actorId, conversationId) {
      const database = createHyperdriveDatabase(hyperdrive);
      try {
        return await createPostgresGetConversationRepository(database.db).get(actorId, conversationId);
      } finally {
        await database.close();
      }
    },
  };
}
