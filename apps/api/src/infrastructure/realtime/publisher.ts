import { createHyperdriveDatabase, schema, sql, type HyperdriveBinding } from "@dayli/db";
import { and, eq, exists, gt, isNull, or } from "drizzle-orm";
import type { OutboxJob } from "../jobs/outbox-store";
import { bodyFreeRealtimeEvent } from "../jobs/dispatch-outbox";

interface UserRealtimeStub {
  fetch(request: Request): Promise<Response>;
  revokeSession(sessionId: string): Promise<void>;
}

/** Internal adapter used only after an outbox lease has been committed. */
export function createDurableObjectRealtimePublisher(
  namespace: DurableObjectNamespace,
  hyperdrive: HyperdriveBinding,
  authorize: (job: OutboxJob) => Promise<boolean> = (job) => canPublishCurrentChange(hyperdrive, job),
) {
  const stubFor = (userId: string) => namespace.get(namespace.idFromName(userId)) as unknown as UserRealtimeStub;
  return {
    async deliver(job: OutboxJob, options?: { signal: AbortSignal }) {
      if (options?.signal.aborted) return { ok: false as const, retryable: true, category: "transient" as const };
      if (job.channel !== "realtime") return { ok: false as const, retryable: false, category: "provider_rejected" as const };
      if (!await authorize(job) || options?.signal.aborted) return options?.signal.aborted ? { ok: false as const, retryable: true, category: "transient" as const } : { ok: true as const };
      // Use the Durable Object's private fetch interface rather than RPC. This
      // keeps delivery compatible with the WebSocket-hibernation runtime and
      // lets a non-success response remain retryable in the outbox.
      const response = await stubFor(job.recipientId).fetch(new Request("https://user-realtime.internal/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyFreeRealtimeEvent(job)),
        signal: options?.signal,
      }));
      if (!response.ok) throw new Error("Realtime publish failed.");
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
        .select({ conversationId: schema.conversationMembers.conversationId })
        .from(schema.conversationMembers)
        .where(and(
          eq(schema.conversationMembers.conversationId, schema.conversations.id),
          eq(schema.conversationMembers.userId, job.recipientId),
        )),
    );
    const blocked = exists(
      database.db
        .select({ blockerId: schema.relationshipBlocks.blockerId })
        .from(schema.relationshipBlocks)
        .where(and(
          isNull(schema.relationshipBlocks.unblockedAt),
          or(
            and(
              eq(schema.relationshipBlocks.blockerId, schema.conversations.userLowId),
              eq(schema.relationshipBlocks.blockedId, schema.conversations.userHighId),
            ),
            and(
              eq(schema.relationshipBlocks.blockerId, schema.conversations.userHighId),
              eq(schema.relationshipBlocks.blockedId, schema.conversations.userLowId),
            ),
          ),
        )),
    );
    const availableParticipant = (
      userId: typeof schema.conversations.userLowId | typeof schema.conversations.userHighId,
    ) => exists(database.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .innerJoin(schema.messagingParticipants, eq(schema.messagingParticipants.userId, schema.user.id))
      .leftJoin(schema.accountLifecycles, eq(schema.accountLifecycles.userId, schema.user.id))
      .where(and(
        eq(schema.user.id, userId),
        eq(schema.messagingParticipants.state, "active"),
        or(isNull(schema.accountLifecycles.state), eq(schema.accountLifecycles.state, "active")),
      )));
    const participantsAvailable = sql<boolean>`${availableParticipant(schema.conversations.userLowId)} and ${availableParticipant(schema.conversations.userHighId)}`;
    const reactionStillPresent = exists(database.db
      .select({ messageId: schema.messageReactions.messageId })
      .from(schema.messageReactions)
      .where(and(
        eq(schema.messageReactions.messageId, schema.conversationChanges.messageId),
        eq(schema.messageReactions.userId, schema.conversationChanges.memberId),
      )));
    const [row] = await database.db
      .select({
        senderId: schema.messages.senderId,
        memberId: schema.conversationChanges.memberId,
        kind: schema.conversationChanges.kind,
        recipientMember,
        participantsAvailable,
        reactionStillPresent,
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
    // New writers persist the actual actor. Old message-created jobs can derive
    // it from the immutable message sender. Other ambiguous old queued changes
    // may be delivered only when neither availability nor blocks changed.
    const actorId = row.memberId ?? (row.kind === "reaction.changed" ? null : row.senderId);
    const positive = row.kind === "message.created"
      || row.kind === "message.edited"
      || row.kind === "request.active"
      || (row.kind === "reaction.changed" && row.reactionStillPresent);
    const cleanup = row.kind === "message.unsent"
      || row.kind === "request.declined"
      || (row.kind === "reaction.changed" && !row.reactionStillPresent);
    if (positive && !row.participantsAvailable) return false;
    if (!row.participantsAvailable) return cleanup && actorId === job.recipientId;
    if (!row.blocked) return true;
    // A block may invalidate only its actual actor. In particular, a reaction
    // change must never fall back to the message sender.
    return actorId === job.recipientId;
  } finally {
    await database.close();
  }
}
