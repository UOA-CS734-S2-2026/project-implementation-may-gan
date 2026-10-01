import { createHyperdriveDatabase, lockRelationshipPair, schema, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { appendConversationChange } from "../../shared/append-conversation-change";
import { messageProjectionSelection, toStoredMessage } from "../../shared/message-projection";
import { requireSafeSequenceBigInt } from "../../shared/safe-sequence";
import type {
  DirectConversation,
  DirectConversationStore,
  DirectConversationTransaction,
} from "../../shared/conversation-types";
import type { StoredMessage } from "../../shared/messaging-types";

type Queryable = Pick<DayliDatabase, "delete" | "insert" | "select" | "update">;

class PostgresDirectTransaction implements DirectConversationTransaction {
  constructor(
    private readonly queryable: Queryable,
    private readonly actorId: string,
    private readonly recipientId: string,
  ) {}

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
        userLowId: schema.conversations.userLowId,
        userHighId: schema.conversations.userHighId,
        requestState: schema.conversations.requestState,
      })
      .from(schema.conversations)
      .where(and(
        eq(schema.conversations.userLowId, sql`least(${actorId}, ${recipientId})`),
        eq(schema.conversations.userHighId, sql`greatest(${actorId}, ${recipientId})`),
      ))
      .limit(1)
      .for("update");
    if (!row) return null;
    return {
      id: row.id,
      peerId: row.userLowId === actorId ? row.userHighId : row.userLowId,
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

  async participantsAvailable(): Promise<boolean> {
    const rows = await this.queryable
      .select({ id: schema.user.id })
      .from(schema.user)
      .innerJoin(schema.messagingParticipants, eq(schema.messagingParticipants.userId, schema.user.id))
      .leftJoin(schema.accountLifecycles, eq(schema.accountLifecycles.userId, schema.user.id))
      .where(and(
        inArray(schema.user.id, [this.actorId, this.recipientId]),
        eq(schema.messagingParticipants.state, "active"),
        or(isNull(schema.accountLifecycles.state), eq(schema.accountLifecycles.state, "active")),
      ));
    return rows.length === 2;
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
        ...messageProjectionSelection,
        directConversationId: schema.conversations.id,
        userLowId: schema.conversations.userLowId,
        userHighId: schema.conversations.userHighId,
        requestState: schema.conversations.requestState,
      })
      .from(schema.messages)
      .innerJoin(schema.conversations, eq(schema.conversations.id, schema.messages.conversationId))
      .where(and(
        eq(schema.messages.senderId, senderId),
        eq(schema.messages.clientMessageId, clientMessageId),
      ))
      .limit(1);
    if (!row) return null;
    return {
      requestFingerprint: row.requestFingerprint,
      conversation: {
        id: row.directConversationId,
        peerId: row.userLowId === senderId ? row.userHighId : row.userLowId,
        requestState: row.requestState,
      },
      message: toStoredMessage(row),
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
      userLowId: sql`least(${input.initiatorId}, ${input.recipientId})`,
      userHighId: sql`greatest(${input.initiatorId}, ${input.recipientId})`,
      initiatorId: input.initiatorId,
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
        userId: input.initiatorId,
        lastReadSequence: 0,
        receiptSequence: 0,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      },
      {
        conversationId: input.conversationId,
        userId: input.recipientId,
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
        senderId: input.initiatorId,
        clientMessageId: input.clientMessageId,
        requestFingerprint: input.requestFingerprint,
        body: input.text,
        version: 1,
        createdAt: input.createdAt,
      })
      .returning(messageProjectionSelection);
    await appendConversationChange(this.queryable, input.conversationId, "message.created", input.messageId, null, input.createdAt);
    return {
      conversation: { id: input.conversationId, peerId: input.recipientId, requestState: input.requestState },
      message: toStoredMessage(message!),
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
      .returning({ sequence: schema.conversations.lastMessageSequence });
    if (!allocated) throw new Error("Conversation disappeared during message insert.");
    requireSafeSequenceBigInt(allocated.sequence);
    const [message] = await this.queryable
      .insert(schema.messages)
      .values({
        id: input.messageId,
        conversationId: input.conversation.id,
        sequence: allocated.sequence,
        senderId: input.senderId,
        clientMessageId: input.clientMessageId,
        requestFingerprint: input.requestFingerprint,
        body: input.text,
        version: 1,
        createdAt: input.createdAt,
      })
      .returning(messageProjectionSelection);
    await appendConversationChange(this.queryable, input.conversation.id, "message.created", input.messageId, null, input.createdAt);
    return toStoredMessage(message!);
  }
}

export function createPostgresDirectConversationStore(database: DayliDatabase): DirectConversationStore {
  return {
    withDirectTransaction: (actorId, recipientId, action) => database.transaction(async (tx) => {
      await tx
        .select({ id: schema.user.id })
        .from(schema.user)
        .where(inArray(schema.user.id, [actorId, recipientId]))
        .orderBy(asc(schema.user.id))
        .for("update");
      await lockRelationshipPair(tx, actorId, recipientId);
      return action(new PostgresDirectTransaction(tx, actorId, recipientId));
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
