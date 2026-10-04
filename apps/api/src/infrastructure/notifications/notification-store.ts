import { createHyperdriveDatabase, schema, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { and, asc, eq, gt, inArray, lt, lte, or } from "drizzle-orm";
import type { FailureCategory } from "../jobs/outbox-store";

export interface NotificationJob {
  id: string;
  eventId: string;
  recipientId: string;
  deviceRegistrationId: string;
  attempts: number;
  leaseToken: string;
  leaseExpiresAt: Date;
}

export interface NotificationStore {
  claimDue(input: { now: Date; limit: number; leaseForMs: number; maxAttempts: number; leaseToken: () => string }): Promise<NotificationJob[]>;
  renewLease(job: Pick<NotificationJob, "id" | "leaseToken">, input: { now: Date; leaseForMs: number }): Promise<NotificationJob | null>;
  markDelivered(job: Pick<NotificationJob, "id" | "leaseToken">, deliveredAt: Date): Promise<boolean>;
  markSuppressed(job: Pick<NotificationJob, "id" | "leaseToken">, category: string): Promise<boolean>;
  reschedule(job: Pick<NotificationJob, "id" | "leaseToken" | "attempts">, input: { availableAt: Date; failureCategory: FailureCategory; terminal: boolean }): Promise<boolean>;
}

const fields = {
  id: schema.notificationDeliveries.id,
  eventId: schema.notificationDeliveries.eventId,
  recipientId: schema.notificationDeliveries.recipientId,
  deviceRegistrationId: schema.notificationDeliveries.deviceRegistrationId,
  attempts: schema.notificationDeliveries.attempts,
  leaseToken: schema.notificationDeliveries.leaseToken,
  leaseExpiresAt: schema.notificationDeliveries.leaseExpiresAt,
};

type JobRow = typeof schema.notificationDeliveries.$inferSelect;
function toJob(row: Pick<JobRow, keyof typeof fields>): NotificationJob {
  return { ...row, leaseToken: row.leaseToken!, leaseExpiresAt: row.leaseExpiresAt! };
}

export function createPostgresNotificationStore(database: DayliDatabase): NotificationStore {
  return {
    async claimDue({ now, limit, leaseForMs, maxAttempts, leaseToken }) {
      const token = leaseToken();
      const leaseExpiresAt = new Date(now.getTime() + leaseForMs);
      return database.transaction(async (tx) => {
        const candidates = await tx.select({ id: schema.notificationDeliveries.id })
          .from(schema.notificationDeliveries)
          .where(and(
            lt(schema.notificationDeliveries.attempts, maxAttempts),
            or(
              and(
                inArray(schema.notificationDeliveries.status, ["pending", "failed"]),
                lte(schema.notificationDeliveries.availableAt, now),
              ),
              and(
                eq(schema.notificationDeliveries.status, "leased"),
                lte(schema.notificationDeliveries.leaseExpiresAt, now),
              ),
            ),
          ))
          .orderBy(
            asc(schema.notificationDeliveries.availableAt),
            asc(schema.notificationDeliveries.createdAt),
            asc(schema.notificationDeliveries.id),
          )
          .limit(limit)
          .for("update", { skipLocked: true });
        if (candidates.length === 0) return [];
        const claimed = await tx.update(schema.notificationDeliveries)
          .set({
            status: "leased",
            attempts: sql<number>`${schema.notificationDeliveries.attempts} + 1`,
            leaseToken: token,
            leaseExpiresAt,
            failureCategory: null,
          })
          .where(inArray(schema.notificationDeliveries.id, candidates.map(({ id }) => id)))
          .returning(fields);
        return claimed.map(toJob);
      });
    },
    async renewLease(job, { now, leaseForMs }) {
      const [row] = await database.update(schema.notificationDeliveries)
        .set({ leaseExpiresAt: new Date(now.getTime() + leaseForMs) })
        .where(and(
          eq(schema.notificationDeliveries.id, job.id),
          eq(schema.notificationDeliveries.status, "leased"),
          eq(schema.notificationDeliveries.leaseToken, job.leaseToken),
          gt(schema.notificationDeliveries.leaseExpiresAt, now),
        ))
        .returning(fields);
      return row ? toJob(row) : null;
    },
    async markDelivered(job, deliveredAt) {
      const rows = await database.update(schema.notificationDeliveries)
        .set({ status: "delivered", deliveredAt, leaseToken: null, leaseExpiresAt: null, failureCategory: null })
        .where(and(
          eq(schema.notificationDeliveries.id, job.id),
          eq(schema.notificationDeliveries.status, "leased"),
          eq(schema.notificationDeliveries.leaseToken, job.leaseToken),
        )).returning({ id: schema.notificationDeliveries.id });
      return rows.length === 1;
    },
    async markSuppressed(job, category) {
      const rows = await database.update(schema.notificationDeliveries)
        .set({ status: "suppressed", leaseToken: null, leaseExpiresAt: null, failureCategory: category })
        .where(and(
          eq(schema.notificationDeliveries.id, job.id),
          eq(schema.notificationDeliveries.status, "leased"),
          eq(schema.notificationDeliveries.leaseToken, job.leaseToken),
        )).returning({ id: schema.notificationDeliveries.id });
      return rows.length === 1;
    },
    async reschedule(job, input) {
      const rows = await database.update(schema.notificationDeliveries)
        .set({
          status: input.terminal ? "failed" : "pending",
          availableAt: input.availableAt,
          leaseToken: null,
          leaseExpiresAt: null,
          failureCategory: input.failureCategory,
        })
        .where(and(
          eq(schema.notificationDeliveries.id, job.id),
          eq(schema.notificationDeliveries.status, "leased"),
          eq(schema.notificationDeliveries.leaseToken, job.leaseToken),
        )).returning({ id: schema.notificationDeliveries.id });
      return rows.length === 1;
    },
  };
}

/** Every operation gets and closes its own Hyperdrive client. */
export function createHyperdriveNotificationStore(hyperdrive: HyperdriveBinding): NotificationStore {
  const run = async <T>(operation: (store: NotificationStore) => Promise<T>): Promise<T> => {
    const client = createHyperdriveDatabase(hyperdrive);
    try { return await operation(createPostgresNotificationStore(client.db)); }
    finally { await client.close(); }
  };
  return {
    claimDue: (input) => run((store) => store.claimDue(input)),
    renewLease: (job, input) => run((store) => store.renewLease(job, input)),
    markDelivered: (job, at) => run((store) => store.markDelivered(job, at)),
    markSuppressed: (job, category) => run((store) => store.markSuppressed(job, category)),
    reschedule: (job, input) => run((store) => store.reschedule(job, input)),
  };
}
