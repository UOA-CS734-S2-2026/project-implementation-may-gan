import { createHyperdriveDatabase, schema, sql, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { and, asc, eq, inArray, isNotNull, isNull, lt, lte, notExists, or } from "drizzle-orm";

/** A claimed cleanup. It names the object to delete and nothing about its owner or post. */
export interface MediaCleanupJob {
  id: string;
  objectKey: string;
  attempts: number;
  leaseToken: string;
  leaseExpiresAt: Date;
}

export interface MediaCleanupStore {
  /**
   * Tombstones and leases up to `limit` abandoned uploads, plus tombstoned uploads
   * whose earlier attempt failed or whose lease expired. The tombstone is set under
   * the row lock the attach path also takes, so an upload is either attached or
   * claimed, never both.
   */
  claimDue(input: {
    now: Date;
    limit: number;
    leaseForMs: number;
    graceMs: number;
    maxAttempts: number;
    leaseToken: () => string;
  }): Promise<MediaCleanupJob[]>;
  /** Removes the row once its object is gone. False means the lease was lost. */
  complete(job: Pick<MediaCleanupJob, "id" | "leaseToken">): Promise<boolean>;
  /**
   * Returns a claimed job to the queue after a failed delete. A null time marks it
   * exhausted: it keeps its tombstone but has no due time, so it drops out of the
   * retry index instead of being scanned on every run.
   */
  reschedule(job: Pick<MediaCleanupJob, "id" | "leaseToken">, availableAt: Date | null): Promise<boolean>;
}

const jobFields = {
  id: schema.mediaReservation.id,
  objectKey: schema.mediaReservation.objectKey,
  attempts: schema.mediaReservation.cleanupAttempts,
  leaseToken: schema.mediaReservation.cleanupLeaseToken,
  leaseExpiresAt: schema.mediaReservation.cleanupLeaseExpiresAt,
};

/** A reservation no post has ever linked, attached or detached. */
const neverLinked = notExists(
  sql`(select 1 from ${schema.postMedia} where ${schema.postMedia.reservationId} = ${schema.mediaReservation.id})`,
);

export function createPostgresMediaCleanupStore(database: DayliDatabase): MediaCleanupStore {
  return {
    async claimDue({ now, limit, leaseForMs, graceMs, maxAttempts, leaseToken }) {
      const token = leaseToken();
      const leaseExpiresAt = new Date(now.getTime() + leaseForMs);
      const abandonedBefore = new Date(now.getTime() - graceMs);
      const abandoned = and(
        isNull(schema.mediaReservation.cleanupClaimedAt),
        lte(schema.mediaReservation.expiresAt, abandonedBefore),
        neverLinked,
      );
      // Retry: coalesce picks the lease expiry while leased, else the backoff time.
      // A linked upload is never retried, so its object is never deleted.
      const retry = and(
        isNotNull(schema.mediaReservation.cleanupClaimedAt),
        neverLinked,
        lt(schema.mediaReservation.cleanupAttempts, maxAttempts),
        sql`coalesce(${schema.mediaReservation.cleanupLeaseExpiresAt}, ${schema.mediaReservation.cleanupAvailableAt}) <= ${now.toISOString()}::timestamptz`,
      );
      return database.transaction(async (tx) => {
        const candidates = await tx
          .select({ id: schema.mediaReservation.id })
          .from(schema.mediaReservation)
          .where(or(abandoned, retry))
          .orderBy(asc(schema.mediaReservation.expiresAt), asc(schema.mediaReservation.id))
          .limit(limit)
          .for("update", { skipLocked: true });
        if (candidates.length === 0) return [];

        // A second statement, so it runs on a fresh snapshot taken after the row locks
        // are held. An attach that committed while the first statement ran is visible
        // here, and one that starts later blocks on our lock and then sees the tombstone.
        const claimed = await tx
          .update(schema.mediaReservation)
          .set({
            cleanupClaimedAt: sql`coalesce(${schema.mediaReservation.cleanupClaimedAt}, ${now.toISOString()}::timestamptz)`,
            cleanupAttempts: sql<number>`${schema.mediaReservation.cleanupAttempts} + 1`,
            cleanupLeaseToken: token,
            cleanupLeaseExpiresAt: leaseExpiresAt,
            cleanupAvailableAt: null,
          })
          .where(and(
            inArray(schema.mediaReservation.id, candidates.map((candidate) => candidate.id)),
            or(abandoned, retry),
          ))
          .returning(jobFields);
        return claimed.map((row) => ({ ...row, leaseToken: row.leaseToken!, leaseExpiresAt: row.leaseExpiresAt! }));
      });
    },
    async complete(job) {
      const deleted = await database
        .delete(schema.mediaReservation)
        .where(and(
          eq(schema.mediaReservation.id, job.id),
          eq(schema.mediaReservation.cleanupLeaseToken, job.leaseToken),
          isNotNull(schema.mediaReservation.cleanupClaimedAt),
          // The RESTRICT foreign key also refuses this; the predicate keeps it from erroring.
          neverLinked,
        ))
        .returning({ id: schema.mediaReservation.id });
      return deleted.length === 1;
    },
    async reschedule(job, availableAt) {
      const rescheduled = await database
        .update(schema.mediaReservation)
        .set({ cleanupLeaseToken: null, cleanupLeaseExpiresAt: null, cleanupAvailableAt: availableAt })
        .where(and(
          eq(schema.mediaReservation.id, job.id),
          eq(schema.mediaReservation.cleanupLeaseToken, job.leaseToken),
        ))
        .returning({ id: schema.mediaReservation.id });
      return rescheduled.length === 1;
    },
  };
}

/** Create an invocation-owned store. Callers do not retain a database client. */
export function createHyperdriveMediaCleanupStore(hyperdrive: HyperdriveBinding): MediaCleanupStore {
  async function withStore<T>(operation: (store: MediaCleanupStore) => Promise<T>): Promise<T> {
    const client = createHyperdriveDatabase(hyperdrive);
    try { return await operation(createPostgresMediaCleanupStore(client.db)); }
    finally { await client.close(); }
  }
  return {
    claimDue: (input) => withStore((store) => store.claimDue(input)),
    complete: (job) => withStore((store) => store.complete(job)),
    reschedule: (job, availableAt) => withStore((store) => store.reschedule(job, availableAt)),
  };
}
