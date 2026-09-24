import { and, eq, gt, sql } from "drizzle-orm";
import { schema, type DayliDatabase } from "@dayli/db";

export interface MediaReservationRecord {
  id: string;
  ownerId: string;
  objectKey: string;
  contentType: string;
  byteSize: number;
  createdAt: Date;
  expiresAt: Date;
}

export type ReserveIfUnderQuotaResult = "inserted" | "quota_exceeded";

export interface MediaReservationRepository {
  /**
   * Atomically counts the owner's active reservations and inserts the new one only
   * if still under quota. Concurrent calls for the same owner must serialise 
   */
  reserveIfUnderQuota(
    ownerId: string,
    maxPending: number,
    now: Date,
    record: MediaReservationRecord,
  ): Promise<ReserveIfUnderQuotaResult>;
  findById(id: string): Promise<MediaReservationRecord | undefined>;
}

/** Namespaces this feature's advisory locks so they can't collide with another feature's. */
const advisoryLockNamespace = sql`hashtext('media_reservation_quota')`;

export function createDrizzleMediaReservationRepository(db: DayliDatabase): MediaReservationRepository {
  return {
    async reserveIfUnderQuota(ownerId, maxPending, now, record) {
      return db.transaction(async (tx) => {
        // Transaction-scoped: released automatically on commit or rollback
        // Serialises all concurrent reservation attempts for this one owner; other
        // owners are unaffected since the lock key is derived from ownerId.
        await tx.execute(sql`select pg_advisory_xact_lock(${advisoryLockNamespace}, hashtext(${ownerId}))`);

        const [row] = await tx
          .select({ value: sql<number>`count(*)::int` })
          .from(schema.mediaReservation)
          .where(and(eq(schema.mediaReservation.ownerId, ownerId), gt(schema.mediaReservation.expiresAt, now)));
        const activeCount = row?.value ?? 0;
        if (activeCount >= maxPending) return "quota_exceeded";

        await tx.insert(schema.mediaReservation).values(record);
        return "inserted";
      });
    },
    async findById(id) {
      const [row] = await db
        .select()
        .from(schema.mediaReservation)
        .where(eq(schema.mediaReservation.id, id))
        .limit(1);
      return row;
    },
  };
}
