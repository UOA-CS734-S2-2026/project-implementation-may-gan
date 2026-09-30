import { createHyperdriveDatabase, schema, sql, type HyperdriveBinding } from "@dayli/db";
import { and, eq, exists, gt, isNull, or } from "drizzle-orm";
import type { ConversationChangedEvent } from "@dayli/contracts";
import type { OutboxJob } from "../jobs/outbox-store";
import { bodyFreeRealtimeEvent } from "../jobs/dispatch-outbox";

interface UserRealtimeRpc {
  publish(event: ConversationChangedEvent): Promise<void>;
  revokeSession(sessionId: string): Promise<void>;
}

/** Internal adapter used only after an outbox lease has been committed. */
export function createDurableObjectRealtimePublisher(
  namespace: DurableObjectNamespace,
  hyperdrive: HyperdriveBinding,
  authorize: (job: OutboxJob) => Promise<boolean> = (job) => canPublishCurrentChange(hyperdrive, job),
) {
  const stubFor = (userId: string) => namespace.get(namespace.idFromName(userId)) as unknown as UserRealtimeRpc;
  return {
    async deliver(job: OutboxJob, options?: { signal: AbortSignal }) {
      if (options?.signal.aborted) return { ok: false as const, retryable: true, category: "transient" as const };
      if (job.channel !== "realtime") return { ok: false as const, retryable: false, category: "provider_rejected" as const };
      if (!await authorize(job) || options?.signal.aborted) return options?.signal.aborted ? { ok: false as const, retryable: true, category: "transient" as const } : { ok: true as const };
      await stubFor(job.recipientId).publish(bodyFreeRealtimeEvent(job));
      return { ok: true as const };
    },
    revokeSession(userId: string, sessionId: string) {
      return stubFor(userId).revokeSession(sessionId);
    },
  };
}

/**
 * Outbox work can wait behind a block or account change. Realtime must perform
 * this fresh authorization independently from push delivery. A blocked change
 * can still invalidate the actor who caused it, but never the peer.
 */
export async function canPublishCurrentChange(hyperdrive: HyperdriveBinding, job: OutboxJob): Promise<boolean> {
  const database = createHyperdriveDatabase(hyperdrive);
  try {
    const recipientMember = exists(
      database.db
        .select({ one: sql<number>`1` })
        .from(schema.conversationMembers)
        .where(and(
          eq(schema.conversationMembers.conversationId, schema.conversations.id),
          eq(schema.conversationMembers.participantId, job.recipientId),
        )),
    );
    const blocked = exists(
      database.db
        .select({ one: sql<number>`1` })
        .from(schema.relationshipBlocks)
        .where(and(
          isNull(schema.relationshipBlocks.unblockedAt),
          or(
            and(
              eq(schema.relationshipBlocks.blockerId, schema.conversations.participantLowId),
              eq(schema.relationshipBlocks.blockedId, schema.conversations.participantHighId),
            ),
            and(
              eq(schema.relationshipBlocks.blockerId, schema.conversations.participantHighId),
              eq(schema.relationshipBlocks.blockedId, schema.conversations.participantLowId),
            ),
          ),
        )),
    );
    const [row] = await database.db
      .select({
        senderId: schema.messages.senderParticipantId,
        memberId: schema.conversationChanges.memberParticipantId,
        recipientMember,
        blocked,
      })
      .from(schema.messagingOutbox)
      .innerJoin(schema.conversations, eq(schema.conversations.id, schema.messagingOutbox.conversationId))
      .innerJoin(schema.conversationChanges, and(
        eq(schema.conversationChanges.conversationId, schema.messagingOutbox.conversationId),
        eq(schema.conversationChanges.changeSequence, schema.messagingOutbox.changeSequence),
      ))
      .leftJoin(schema.messages, eq(schema.messages.id, schema.conversationChanges.messageId))
      .where(and(
        eq(schema.messagingOutbox.id, job.id),
        eq(schema.messagingOutbox.recipientId, job.recipientId),
        eq(schema.messagingOutbox.status, "leased"),
        eq(schema.messagingOutbox.leaseToken, job.leaseToken),
        gt(schema.messagingOutbox.leaseExpiresAt, sql`now()`),
      ))
      .limit(1);
    if (!row || !row.recipientMember) return false;
    if (!row.blocked) return true;
    // Private actor invalidations do not expose new peer activity. The actor is
    // derived from the persisted change, never from an outbox caller.
    const actorId = row.senderId ?? row.memberId;
    return actorId === job.recipientId;
  } finally {
    await database.close();
  }
}
