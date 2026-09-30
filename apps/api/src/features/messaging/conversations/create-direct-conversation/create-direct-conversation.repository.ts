import { createHyperdriveDatabase, schema, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { and, eq, isNull, or } from "drizzle-orm";
import { appendConversationChange } from "../../shared/append-conversation-change";
import type {
  DirectConversation,
  DirectConversationStore,
  DirectConversationTransaction,
} from "../../shared/conversation-types";
import type { StoredMessage } from "../../shared/messaging-types";

type Queryable = Pick<DayliDatabase, "delete" | "insert" | "select" | "update">;

type MessageRow = {
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

const messageSelection = {
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
};

function storedMessage(row: MessageRow): StoredMessage {
  return {
    ...row,
    sequence: BigInt(row.sequence),
    version: Number(row.version),
    reactions: [],
  };
}

function relationshipPairKey(leftUserId: string, rightUserId: string): string {
  return [leftUserId, rightUserId]
    .sort()
    .map((value) => `${value.length}:${value}`)
    .join(":");
}

class PostgresDirectTransaction implements DirectConversationTransaction {
  constructor(private readonly queryable: Queryable, private readonly actorId: string) {}

  async isPairBlocked(actorId: string, recipientId: string): Promise<boolean> {
    const [row] = await this.queryable
      .select({ blockerId: schema.relationshipBlocks.blockerId })
      .from(schema.relationshipBlocks)
      .where(and(
        isNull(schema.relationshipBlocks.unblockedAt),
        or(
          and(
            eq(schema.relationshipBlocks.blockerId, actorId),
            eq(schema.relationshipBlocks.blockedId, recipientId),
          ),
          and(
            eq(schema.relationshipBlocks.blockerId, recipientId),
            eq(schema.relationshipBlocks.blockedId, actorId),
          ),
        ),
      ))
      .limit(1);
    return Boolean(row);
  }

  async findDirectConversation(actorId: string, recipientId: string): Promise<DirectConversation | null> {
    const [row] = await this.queryable
      .select({
        id: schema.conversations.id,
        participantLowId: schema.conversations.participantLowId,
        participantHighId: schema.conversations.participantHighId,
        requestState: schema.conversations.requestState,
      })
      .from(schema.conversations)
      .where(and(
        eq(schema.conversations.participantLowId, sql`least(${actorId}, ${recipientId})`),
        eq(schema.conversations.participantHighId, sql`greatest(${actorId}, ${recipientId})`),
      ))
      .limit(1)
      .for("update");
    if (!row) return null;
    return {
      id: row.id,
      peerId: row.participantLowId === actorId ? row.participantHighId : row.participantLowId,
      requestState: row.requestState,
    };
  }

  async recipientExists(recipientId: string): Promise<boolean> {
    const [row] = await this.queryable
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.id, recipientId))
      .limit(1);
    return Boolean(row);
  }

  async hasActiveFriendship(actorId: string, recipientId: string): Promise<boolean> {
    const [row] = await this.queryable
      .select({ userId: schema.friendships.userId })
      .from(schema.friendships)
      .where(and(
        eq(schema.friendships.userId, actorId),
        eq(schema.friendships.friendId, recipientId),
        eq(schema.friendships.state, "active"),
      ))
      .limit(1);
    return Boolean(row);
  }

  async findIdempotentMessage(senderId: string, clientMessageId: string) {
    const [row] = await this.queryable
      .select({
        ...messageSelection,
        directConversationId: schema.conversations.id,
        participantLowId: schema.conversations.participantLowId,
        participantHighId: schema.conversations.participantHighId,
        requestState: schema.conversations.requestState,
      })
      .from(schema.messages)
      .innerJoin(schema.conversations, eq(schema.conversations.id, schema.messages.conversationId))
      .where(and(
        eq(schema.messages.senderParticipantId, senderId),
        eq(schema.messages.clientMessageId, clientMessageId),
      ))
      .limit(1);
    if (!row) return null;
    return {
      requestFingerprint: row.requestFingerprint,
      conversation: {
        id: row.directConversationId,
        peerId: row.participantLowId === senderId ? row.participantHighId : row.participantLowId,
        requestState: row.requestState,
      },
      message: storedMessage(row),
    };
  }

  async activateConversation(conversation: DirectConversation, now: Date): Promise<DirectConversation> {
    await this.queryable
      .update(schema.conversations)
      .set({ requestState: "active", updatedAt: now })
      .where(eq(schema.conversations.id, conversation.id));
    await appendConversationChange(this.queryable, conversation.id, "request.active", null, null, now);
    return { ...conversation, requestState: "active" };
  }

  async createConversationWithMessage(input: Parameters<DirectConversationTransaction["createConversationWithMessage"]>[0]) {
    await this.queryable.insert(schema.conversations).values({
      id: input.conversationId,
      kind: "direct",
      participantLowId: sql`least(${input.initiatorId}, ${input.recipientId})`,
      participantHighId: sql`greatest(${input.initiatorId}, ${input.recipientId})`,
      initiatorParticipantId: input.initiatorId,
      requestState: input.requestState,
      lastMessageSequence: 1,
      lastChangeSequence: 0,
      lastActivityAt: input.createdAt,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    });
    await this.queryable.insert(schema.conversationMembers).values([
      {
        conversationId: input.conversationId,
        participantId: input.initiatorId,
        lastReadSequence: 0,
        receiptSequence: 0,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      },
      {
        conversationId: input.conversationId,
        participantId: input.recipientId,
        lastReadSequence: 0,
        receiptSequence: 0,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      },
    ]);
    const [message] = await this.queryable
      .insert(schema.messages)
      .values({
        id: input.messageId,
        conversationId: input.conversationId,
        sequence: 1,
        senderParticipantId: input.initiatorId,
        clientMessageId: input.clientMessageId,
        requestFingerprint: input.requestFingerprint,
        body: input.text,
        version: 1,
        createdAt: input.createdAt,
      })
      .returning(messageSelection);
    await appendConversationChange(this.queryable, input.conversationId, "message.created", input.messageId, null, input.createdAt);
    return {
      conversation: { id: input.conversationId, peerId: input.recipientId, requestState: input.requestState },
      message: storedMessage(message!),
    };
  }

  async appendExistingMessage(input: Parameters<DirectConversationTransaction["appendExistingMessage"]>[0]): Promise<StoredMessage> {
    const [allocated] = await this.queryable
      .update(schema.conversations)
      .set({
        lastMessageSequence: sql`${schema.conversations.lastMessageSequence} + 1`,
        lastActivityAt: input.createdAt,
        updatedAt: input.createdAt,
      })
      .where(eq(schema.conversations.id, input.conversation.id))
      .returning({ sequence: sql<string>`${schema.conversations.lastMessageSequence}::text` });
    const [message] = await this.queryable
      .insert(schema.messages)
      .values({
        id: input.messageId,
        conversationId: input.conversation.id,
        sequence: sql`${allocated!.sequence}::bigint`,
        senderParticipantId: input.senderId,
        clientMessageId: input.clientMessageId,
        requestFingerprint: input.requestFingerprint,
        body: input.text,
        version: 1,
        createdAt: input.createdAt,
      })
      .returning(messageSelection);
    await appendConversationChange(this.queryable, input.conversation.id, "message.created", input.messageId, null, input.createdAt);
    return storedMessage(message!);
  }
}

export function createPostgresDirectConversationStore(database: DayliDatabase): DirectConversationStore {
  return {
    withDirectTransaction: (actorId, recipientId, action) => database.transaction(async (tx) => {
      await tx
        .select({ lock: sql`pg_advisory_xact_lock(hashtextextended(${relationshipPairKey(actorId, recipientId)}, 734))` })
        .from(sql`(values (1)) as lock_source`);
      return action(new PostgresDirectTransaction(tx, actorId));
    }),
  };
}

export function createHyperdriveDirectConversationStore(hyperdrive: HyperdriveBinding): DirectConversationStore {
  return {
    async withDirectTransaction(actorId, recipientId, action) {
      const database = createHyperdriveDatabase(hyperdrive);
      try {
        return await createPostgresDirectConversationStore(database.db).withDirectTransaction(actorId, recipientId, action);
      } finally {
        await database.close();
      }
    },
  };
}
