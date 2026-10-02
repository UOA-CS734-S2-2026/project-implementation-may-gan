import { createHyperdriveDatabase, schema, sql, type HyperdriveBinding } from "@dayli/db";
import { and, eq, exists, gt, isNull, or } from "drizzle-orm";
import type { OutboxJob } from "../jobs/outbox-store";
import { conversationPairBlocked, conversationParticipantsAvailable } from "../../features/messaging/shared/conversation-participants";
import { allowsAccountCapability } from "../../features/account-policy/shared/account-policy";
import { readAccountPolicy } from "../../features/account-policy/shared/account-policy.repository";
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
        .innerJoin(schema.messagingParticipants, and(
          eq(schema.messagingParticipants.id, schema.conversationMembers.participantId),
          eq(schema.messagingParticipants.userId, job.recipientId),
          eq(schema.messagingParticipants.state, "active"),
        ))
        .leftJoin(schema.accountLifecycles, eq(schema.accountLifecycles.userId, schema.conversationMembers.userId))
        .where(and(
          eq(schema.conversationMembers.conversationId, schema.conversations.id),
          or(isNull(schema.accountLifecycles.state), eq(schema.accountLifecycles.state, "active")),
        )),
    );
    const blocked = conversationPairBlocked(
      database.db,
      schema.conversations.participantLowId,
      schema.conversations.participantHighId,
    );
    const participantsAvailable = conversationParticipantsAvailable(
      schema.conversations.participantLowId,
      schema.conversations.participantHighId,
    );
    const reactionStillPresent = exists(database.db
      .select({ messageId: schema.messageReactions.messageId })
      .from(schema.messageReactions)
      .where(and(
        eq(schema.messageReactions.messageId, schema.conversationChanges.messageId),
        eq(schema.messageReactions.participantId, schema.conversationChanges.memberParticipantId),
      )));
    const [row] = await database.db
      .select({
        actorId: sql<string | null>`case
          when ${schema.conversationChanges.kind} = 'reaction.changed' then coalesce(
            (select ${schema.messagingParticipants.userId}
              from ${schema.messagingParticipants}
              where ${schema.messagingParticipants.id} = ${schema.conversationChanges.memberParticipantId}
              limit 1),
            ${schema.conversationChanges.memberId}
          )
          else coalesce(
            (select ${schema.messagingParticipants.userId}
              from ${schema.messagingParticipants}
              where ${schema.messagingParticipants.id} = ${schema.conversationChanges.memberParticipantId}
              limit 1),
            ${schema.conversationChanges.memberId},
            (select ${schema.messagingParticipants.userId}
              from ${schema.messagingParticipants}
              where ${schema.messagingParticipants.id} = ${schema.messages.senderParticipantId}
              limit 1),
            ${schema.messages.senderId}
          )
        end`,
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
    try {
      if (!allowsAccountCapability(await readAccountPolicy(database.db, job.recipientId), "ordinary")) return false;
    } catch {
      return false;
    }
    // New writers persist the actual actor. Old message-created jobs can derive
    // it from the immutable message sender. Other ambiguous old queued changes
    // may be delivered only when neither availability nor blocks changed.
    const actorId = row.actorId;
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
