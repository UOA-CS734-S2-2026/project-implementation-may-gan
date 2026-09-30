import { createHyperdriveDatabase, sql, type HyperdriveBinding } from "@dayli/db";
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
    const result = await database.db.execute(sql`
      select c.participant_low_id, c.participant_high_id, change.kind, message.sender_participant_id, change.member_participant_id,
        exists(select 1 from public.conversation_members member join public.messaging_participants recipient on recipient.id = member.participant_id and recipient.user_id = ${job.recipientId} and recipient.state = 'active' where member.conversation_id = c.id) as recipient_member,
        exists(select 1 from public.relationship_blocks block where block.unblocked_at is null and
          ((block.blocker_id = c.participant_low_id and block.blocked_id = c.participant_high_id) or (block.blocker_id = c.participant_high_id and block.blocked_id = c.participant_low_id))) as blocked
      from public.messaging_outbox outbox
      join public.conversations c on c.id = outbox.conversation_id
      join public.conversation_changes change on change.conversation_id = outbox.conversation_id and change.change_sequence = outbox.change_sequence
      left join public.messages message on message.id = change.message_id
      where outbox.id = ${job.id} and outbox.recipient_id = ${job.recipientId}
        and outbox.status = 'leased' and outbox.lease_token = ${job.leaseToken}
        and outbox.lease_expires_at > now()
      limit 1
    `);
    const [row] = [...result as Iterable<Record<string, unknown>>];
    if (!row || row.recipient_member !== true) return false;
    if (row.blocked !== true) return true;
    // Private actor invalidations do not expose new peer activity. The actor is
    // derived from the persisted change, never from an outbox caller.
    const actorId = typeof row.sender_participant_id === "string" ? row.sender_participant_id : typeof row.member_participant_id === "string" ? row.member_participant_id : null;
    return actorId === job.recipientId;
  } finally {
    await database.close();
  }
}
