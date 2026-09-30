import { createHyperdriveDatabase, schema, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { and, count, desc, eq, gt, isNull, ne } from "drizzle-orm";
import { appendConversationChange } from "../../shared/append-conversation-change";
import { projectConversationDto } from "../../shared/conversation-projection";
import { messageProjectionSelection } from "../../shared/message-projection";
import { MessagingError } from "../../shared/messaging-error";
import { requireConversationMember } from "../../shared/require-conversation-member";
import { requireSafeSequenceBigInt } from "../../shared/safe-sequence";

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

async function conversationAfterResolution(
  database: DayliDatabase,
  actorId: string,
  conversationId: string,
) {
  const row = await requireConversationMember(database, actorId, conversationId);
  const peer = String(row.user_low_id) === actorId ? String(row.user_high_id) : String(row.user_low_id);
  const lastReadSequence = Number(requireSafeSequenceBigInt(row.last_read_sequence));
  const [user] = await database
    .select({ name: sql<string | null>`coalesce(${schema.user.displayUsername}, ${schema.user.username})` })
    .from(schema.user)
    .where(eq(schema.user.id, peer))
    .limit(1);
  const [latest] = await database
    .select(messageProjectionSelection)
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .orderBy(desc(schema.messages.sequence))
    .limit(1);
  const [unread] = await database
    .select({ count: count() })
    .from(schema.messages)
    .where(and(
      eq(schema.messages.conversationId, conversationId),
      ne(schema.messages.senderId, actorId),
      gt(schema.messages.sequence, lastReadSequence),
      isNull(schema.messages.unsentAt),
    ));
  return projectConversationDto(database, {
    ...row,
    peer_id: peer,
    peer_name: user?.name,
    unread_count: unread?.count ?? 0,
    latestMessage: latest ?? null,
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
            userLowId: schema.conversations.userLowId,
            userHighId: schema.conversations.userHighId,
          })
          .from(schema.conversations)
          .where(eq(schema.conversations.id, conversationId))
          .limit(1);
        if (!pair) throw new MessagingError("NOT_FOUND");
        await lockRelationshipPair(tx, pair.userLowId, pair.userHighId);

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
