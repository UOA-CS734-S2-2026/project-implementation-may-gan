import { createHyperdriveDatabase, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";

export type OutboxChannel = "realtime" | "push";
export type OutboxStatus = "pending" | "leased" | "delivered" | "failed";

/** A claimed delivery intent. It deliberately contains no message body or provider token. */
export interface OutboxJob {
  id: string;
  eventId: string;
  recipientId: string;
  conversationId: string;
  changeSequence: string;
  channel: OutboxChannel;
  deviceRegistrationId: string | null;
  attempts: number;
  leaseToken: string;
  leaseExpiresAt: Date;
}

export interface OutboxStore {
  claimDue(input: {
    now: Date;
    limit: number;
    leaseForMs: number;
    maxAttempts: number;
    leaseToken: () => string;
  }): Promise<OutboxJob[]>;
  /** Extends only a still-live lease. False means another worker owns it or it expired. */
  renewLease(job: Pick<OutboxJob, "id" | "leaseToken">, input: { now: Date; leaseForMs: number }): Promise<OutboxJob | null>;
  /** Return a claimed job that was not started because a bounded dispatch ran out of time. */
  releaseLease(job: Pick<OutboxJob, "id" | "leaseToken">, availableAt: Date): Promise<boolean>;
  markDelivered(job: Pick<OutboxJob, "id" | "leaseToken">, deliveredAt: Date): Promise<boolean>;
  reschedule(job: Pick<OutboxJob, "id" | "leaseToken" | "attempts">, input: {
    availableAt: Date;
    failureCategory: FailureCategory;
    terminal: boolean;
  }): Promise<boolean>;
}

export type FailureCategory = "transient" | "rate_limited" | "provider_rejected" | "unauthorized" | "unknown";

type Row = Record<string, unknown>;
const rows = <T extends Row>(value: unknown) => [...value as Iterable<T>];
const toDate = (value: unknown) => new Date(String(value));
const toNumber = (value: unknown) => Number(value);
const timestamp = (value: Date) => value.toISOString();

/**
 * Claims are committed before any external call. The token fences a late worker
 * from acknowledging a lease reclaimed by a newer worker.
 */
export function createPostgresOutboxStore(database: DayliDatabase): OutboxStore {
  return {
    async claimDue({ now, limit, leaseForMs, maxAttempts, leaseToken }) {
      const token = leaseToken();
      const leaseExpiresAt = new Date(now.getTime() + leaseForMs);
      const nowTimestamp = timestamp(now);
      const leaseExpiryTimestamp = timestamp(leaseExpiresAt);
      const result = await database.transaction(async (tx) => tx.execute(sql`
        with candidates as (
          select id
          from public.messaging_outbox
          where attempts < ${maxAttempts}
            and (
              (status in ('pending', 'failed') and available_at <= ${nowTimestamp}::timestamptz)
              or (status = 'leased' and lease_expires_at <= ${nowTimestamp}::timestamptz)
            )
          order by available_at, created_at, id
          for update skip locked
          limit ${limit}
        )
        update public.messaging_outbox as outbox
        set status = 'leased',
            attempts = outbox.attempts + 1,
            lease_token = ${token},
            lease_expires_at = ${leaseExpiryTimestamp}::timestamptz,
            failure_category = null
        from candidates
        where outbox.id = candidates.id
        returning outbox.id, outbox.event_id, outbox.recipient_id, outbox.conversation_id,
          outbox.change_sequence, outbox.channel, outbox.device_registration_id,
          outbox.attempts, outbox.lease_token, outbox.lease_expires_at
      `));
      return rows<Row>(result).map((row) => ({
        id: String(row.id), eventId: String(row.event_id), recipientId: String(row.recipient_id),
        conversationId: String(row.conversation_id), changeSequence: String(row.change_sequence),
        channel: row.channel === "push" ? "push" : "realtime",
        deviceRegistrationId: row.device_registration_id === null ? null : String(row.device_registration_id),
        attempts: toNumber(row.attempts), leaseToken: String(row.lease_token), leaseExpiresAt: toDate(row.lease_expires_at),
      }));
    },
    async renewLease(job, { now, leaseForMs }) {
      const leaseExpiresAt = new Date(now.getTime() + leaseForMs);
      const result = await database.execute(sql`
        update public.messaging_outbox
        set lease_expires_at = ${timestamp(leaseExpiresAt)}::timestamptz
        where id = ${job.id} and status = 'leased' and lease_token = ${job.leaseToken}
          and lease_expires_at > ${timestamp(now)}::timestamptz
        returning id, event_id, recipient_id, conversation_id, change_sequence, channel,
          device_registration_id, attempts, lease_token, lease_expires_at
      `);
      const [row] = rows<Row>(result);
      return row ? {
        id: String(row.id), eventId: String(row.event_id), recipientId: String(row.recipient_id),
        conversationId: String(row.conversation_id), changeSequence: String(row.change_sequence),
        channel: row.channel === "push" ? "push" : "realtime",
        deviceRegistrationId: row.device_registration_id === null ? null : String(row.device_registration_id),
        attempts: toNumber(row.attempts), leaseToken: String(row.lease_token), leaseExpiresAt: toDate(row.lease_expires_at),
      } : null;
    },
    async releaseLease(job, availableAt) {
      const result = await database.execute(sql`
        update public.messaging_outbox
        set status = 'pending', available_at = ${timestamp(availableAt)}::timestamptz,
          lease_token = null, lease_expires_at = null
        where id = ${job.id} and status = 'leased' and lease_token = ${job.leaseToken}
        returning id
      `);
      return rows<Row>(result).length === 1;
    },
    async markDelivered(job, deliveredAt) {
      const result = await database.execute(sql`
        update public.messaging_outbox
        set status = 'delivered', delivered_at = ${timestamp(deliveredAt)}::timestamptz,
          lease_token = null, lease_expires_at = null, failure_category = null
        where id = ${job.id} and status = 'leased' and lease_token = ${job.leaseToken}
        returning id
      `);
      return rows<Row>(result).length === 1;
    },
    async reschedule(job, input) {
      const status: OutboxStatus = input.terminal ? "failed" : "pending";
      const result = await database.execute(sql`
        update public.messaging_outbox
        set status = ${status}, available_at = ${timestamp(input.availableAt)}::timestamptz,
          lease_token = null, lease_expires_at = null, failure_category = ${input.failureCategory}
        where id = ${job.id} and status = 'leased' and lease_token = ${job.leaseToken}
        returning id
      `);
      return rows<Row>(result).length === 1;
    },
  };
}

/** Create an invocation-owned store. Callers do not retain a request database client. */
export function createHyperdriveOutboxStore(hyperdrive: HyperdriveBinding): OutboxStore {
  return {
    async claimDue(input) {
      const client = createHyperdriveDatabase(hyperdrive);
      try { return await createPostgresOutboxStore(client.db).claimDue(input); }
      finally { await client.close(); }
    },
    async renewLease(job, input) {
      const client = createHyperdriveDatabase(hyperdrive);
      try { return await createPostgresOutboxStore(client.db).renewLease(job, input); }
      finally { await client.close(); }
    },
    async releaseLease(job, availableAt) {
      const client = createHyperdriveDatabase(hyperdrive);
      try { return await createPostgresOutboxStore(client.db).releaseLease(job, availableAt); }
      finally { await client.close(); }
    },
    async markDelivered(job, deliveredAt) {
      const client = createHyperdriveDatabase(hyperdrive);
      try { return await createPostgresOutboxStore(client.db).markDelivered(job, deliveredAt); }
      finally { await client.close(); }
    },
    async reschedule(job, input) {
      const client = createHyperdriveDatabase(hyperdrive);
      try { return await createPostgresOutboxStore(client.db).reschedule(job, input); }
      finally { await client.close(); }
    },
  };
}
