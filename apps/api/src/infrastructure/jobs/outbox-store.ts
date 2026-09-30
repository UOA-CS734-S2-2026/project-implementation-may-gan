import { createHyperdriveDatabase, schema, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { and, asc, eq, gt, inArray, lt, lte, or } from "drizzle-orm";

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

type OutboxJobRow = Pick<typeof schema.messagingOutbox.$inferSelect,
  "id" | "eventId" | "recipientId" | "conversationId" | "channel" |
  "deviceRegistrationId" | "attempts" | "leaseToken" | "leaseExpiresAt"> & {
  changeSequence: string;
};

const outboxJobFields = {
  id: schema.messagingOutbox.id,
  eventId: schema.messagingOutbox.eventId,
  recipientId: schema.messagingOutbox.recipientId,
  conversationId: schema.messagingOutbox.conversationId,
  changeSequence: sql<string>`${schema.messagingOutbox.changeSequence}::text`,
  channel: schema.messagingOutbox.channel,
  deviceRegistrationId: schema.messagingOutbox.deviceRegistrationId,
  attempts: schema.messagingOutbox.attempts,
  leaseToken: schema.messagingOutbox.leaseToken,
  leaseExpiresAt: schema.messagingOutbox.leaseExpiresAt,
};

function toOutboxJob(row: OutboxJobRow): OutboxJob {
  // Both callers set these non-null columns as part of the same UPDATE.
  return {
    ...row,
    changeSequence: row.changeSequence,
    leaseToken: row.leaseToken!,
    leaseExpiresAt: row.leaseExpiresAt!,
  };
}

/**
 * Claims are committed before any external call. The row locks acquired with
 * FOR UPDATE SKIP LOCKED remain held through the following update, so no other
 * worker can claim a selected row between the two typed builder statements.
 */
export function createPostgresOutboxStore(database: DayliDatabase): OutboxStore {
  return {
    async claimDue({ now, limit, leaseForMs, maxAttempts, leaseToken }) {
      const token = leaseToken();
      const leaseExpiresAt = new Date(now.getTime() + leaseForMs);
      return database.transaction(async (tx) => {
        const candidates = await tx
          .select({ id: schema.messagingOutbox.id })
          .from(schema.messagingOutbox)
          .where(and(
            lt(schema.messagingOutbox.attempts, maxAttempts),
            or(
              and(
                inArray(schema.messagingOutbox.status, ["pending", "failed"]),
                lte(schema.messagingOutbox.availableAt, now),
              ),
              and(
                eq(schema.messagingOutbox.status, "leased"),
                lte(schema.messagingOutbox.leaseExpiresAt, now),
              ),
            ),
          ))
          .orderBy(
            asc(schema.messagingOutbox.availableAt),
            asc(schema.messagingOutbox.createdAt),
            asc(schema.messagingOutbox.id),
          )
          .limit(limit)
          .for("update", { skipLocked: true });
        if (candidates.length === 0) return [];

        const claimed = await tx
          .update(schema.messagingOutbox)
          .set({
            status: "leased",
            attempts: sql<number>`${schema.messagingOutbox.attempts} + 1`,
            leaseToken: token,
            leaseExpiresAt,
            failureCategory: null,
          })
          .where(inArray(schema.messagingOutbox.id, candidates.map((candidate) => candidate.id)))
          .returning(outboxJobFields);
        return claimed.map(toOutboxJob);
      });
    },
    async renewLease(job, { now, leaseForMs }) {
      const leaseExpiresAt = new Date(now.getTime() + leaseForMs);
      const [row] = await database
        .update(schema.messagingOutbox)
        .set({ leaseExpiresAt })
        .where(and(
          eq(schema.messagingOutbox.id, job.id),
          eq(schema.messagingOutbox.status, "leased"),
          eq(schema.messagingOutbox.leaseToken, job.leaseToken),
          gt(schema.messagingOutbox.leaseExpiresAt, now),
        ))
        .returning(outboxJobFields);
      return row ? toOutboxJob(row) : null;
    },
    async releaseLease(job, availableAt) {
      const released = await database
        .update(schema.messagingOutbox)
        .set({ status: "pending", availableAt, leaseToken: null, leaseExpiresAt: null })
        .where(and(
          eq(schema.messagingOutbox.id, job.id),
          eq(schema.messagingOutbox.status, "leased"),
          eq(schema.messagingOutbox.leaseToken, job.leaseToken),
        ))
        .returning({ id: schema.messagingOutbox.id });
      return released.length === 1;
    },
    async markDelivered(job, deliveredAt) {
      const delivered = await database
        .update(schema.messagingOutbox)
        .set({ status: "delivered", deliveredAt, leaseToken: null, leaseExpiresAt: null, failureCategory: null })
        .where(and(
          eq(schema.messagingOutbox.id, job.id),
          eq(schema.messagingOutbox.status, "leased"),
          eq(schema.messagingOutbox.leaseToken, job.leaseToken),
        ))
        .returning({ id: schema.messagingOutbox.id });
      return delivered.length === 1;
    },
    async reschedule(job, input) {
      const status: OutboxStatus = input.terminal ? "failed" : "pending";
      const rescheduled = await database
        .update(schema.messagingOutbox)
        .set({
          status,
          availableAt: input.availableAt,
          leaseToken: null,
          leaseExpiresAt: null,
          failureCategory: input.failureCategory,
        })
        .where(and(
          eq(schema.messagingOutbox.id, job.id),
          eq(schema.messagingOutbox.status, "leased"),
          eq(schema.messagingOutbox.leaseToken, job.leaseToken),
        ))
        .returning({ id: schema.messagingOutbox.id });
      return rescheduled.length === 1;
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
