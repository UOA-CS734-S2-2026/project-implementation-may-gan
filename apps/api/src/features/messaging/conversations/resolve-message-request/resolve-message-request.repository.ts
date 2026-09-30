import { createHyperdriveDatabase, schema, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { appendConversationChange } from "../../shared/append-conversation-change";
import { projectConversationDto } from "../../shared/conversation-projection";
import { MessagingError } from "../../shared/messaging-error";
import { requireConversationMember } from "../../shared/require-conversation-member";

type Row = Record<string, unknown>;

type MessageLookup = {
  id: string;
  conversationId: string;
  sequence: string;
  senderId: string;
  clientMessageId: string;
  requestFingerprint: string;
  body: string | null;
  replyToMessageId: string | null;
  version: string;
  createdAt: Date;
  editedAt: Date | null;
  unsentAt: Date | null;
};

export interface ResolveMessageRequestRepository {
  resolve(
    actorId: string,
    conversationId: string,
    decision: "accept" | "decline",
  ): Promise<unknown>;
}

function relationshipPairKey(leftUserId: string, rightUserId: string): string {
  return [leftUserId, rightUserId]
    .sort()
    .map((value) => `${value.length}:${value}`)
    .join(":");
}

async function lockRelationshipPair(
  database: Pick<DayliDatabase, "select">,
  leftUserId: string,
  rightUserId: string,
): Promise<void> {
  const locks = await database
    .select({ lock: sql`pg_advisory_xact_lock(hashtextextended(${relationshipPairKey(leftUserId, rightUserId)}, 734))` })
    .from(sql`(values (1)) as lock_source`);
  if (locks.length !== 1) throw new Error("Relationship pair lock did not return exactly one row.");
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

async function conversationAfterResolution(
  database: DayliDatabase,
  actorId: string,
  conversationId: string,
) {
  const row = await requireConversationMember(database, actorId, conversationId);
  const peer = String(row.user_low_id) === actorId ? String(row.user_high_id) : String(row.user_low_id);
  const [user] = await database
    .select({ name: sql<string | null>`coalesce(${schema.user.displayUsername}, ${schema.user.username})` })
    .from(schema.user)
    .where(eq(schema.user.id, peer))
    .limit(1);
  const [latest] = await database
    .select({
      id: schema.messages.id,
      conversationId: schema.messages.conversationId,
      sequence: sql<string>`${schema.messages.sequence}::text`,
      senderId: schema.messages.senderParticipantId,
      clientMessageId: schema.messages.clientMessageId,
      requestFingerprint: schema.messages.requestFingerprint,
      body: schema.messages.body,
      replyToMessageId: schema.messages.replyToMessageId,
      version: sql<string>`${schema.messages.version}::text`,
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
    peer_name: user?.name,
    unread_count: unread?.count ?? 0,
    ...(latest ? messageProjection(latest) : {}),
  }, actorId);
}

export function createPostgresResolveMessageRequestRepository(
  database: DayliDatabase,
): ResolveMessageRequestRepository {
  return {
    async resolve(actorId, conversationId, decision) {
      await database.transaction(async (tx) => {
        const [pair] = await tx
          .select({
            participantLowId: schema.conversations.participantLowId,
            participantHighId: schema.conversations.participantHighId,
          })
          .from(schema.conversations)
          .where(eq(schema.conversations.id, conversationId))
          .limit(1);
        if (!pair) throw new MessagingError("NOT_FOUND");
        await lockRelationshipPair(tx, pair.participantLowId, pair.participantHighId);

        const row = await requireConversationMember(tx, actorId, conversationId, true);
        if (row.blocked === true) throw new MessagingError("BLOCKED");
        const state = decision === "accept" ? "active" : "declined";
        if (String(row.initiator_id) === actorId) throw new MessagingError("FORBIDDEN");
        if (row.request_state === state) return;
        if (row.request_state !== "pending") throw new MessagingError("FORBIDDEN");

        await tx
          .update(schema.conversations)
          .set({ requestState: state, updatedAt: sql`now()` })
          .where(eq(schema.conversations.id, conversationId));
        await appendConversationChange(tx, conversationId, `request.${state}`, null, actorId, new Date());
      });
      return conversationAfterResolution(database, actorId, conversationId);
    },
  };
}

export function createHyperdriveResolveMessageRequestRepository(
  hyperdrive: HyperdriveBinding,
): ResolveMessageRequestRepository {
  return {
    async resolve(actorId, conversationId, decision) {
      const database = createHyperdriveDatabase(hyperdrive);
      try {
        return await createPostgresResolveMessageRequestRepository(database.db).resolve(
          actorId,
          conversationId,
          decision,
        );
      } finally {
        await database.close();
      }
    },
  };
}
