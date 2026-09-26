import { and, eq, gt, sql } from "drizzle-orm";
import { schema, type DayliDatabase } from "@dayli/db";

export type MediaReservationStatus = "pending" | "validated" | "failed";
export type MediaValidationFailureReason =
  | "byte_size_mismatch"
  | "format_mismatch"
  | "duration_exceeded"
  | "malformed_container"
  | "object_not_found";

export interface MediaReservationRecord {
  id: string;
  ownerId: string;
  objectKey: string;
  contentType: string;
  byteSize: number;
  status: MediaReservationStatus;
  failureReason: MediaValidationFailureReason | null;
  validatedAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
}

export type ReserveIfUnderQuotaResult = "inserted" | "quota_exceeded";

export interface ValidationOutcome {
  status: "validated" | "failed";
  failureReason: MediaValidationFailureReason | null;
  validatedAt: Date;
}

export type ClaimValidationOutcomeResult =
  | { outcome: "claimed"; record: MediaReservationRecord }
  | { outcome: "already_settled"; record: MediaReservationRecord | undefined };

export interface MediaReservationRepository {
  /**
   * Atomically counts the owner's active reservations and inserts the new one only
   * if still under quota. Concurrent calls for the same owner must serialise so the
   * count they each see reflects any sibling call already committed — a plain
   * "count then insert" race lets N simultaneous requests all read the same
   * under-quota count and all insert, blowing past the limit.
   */
  reserveIfUnderQuota(
    ownerId: string,
    maxPending: number,
    now: Date,
    record: MediaReservationRecord,
  ): Promise<ReserveIfUnderQuotaResult>;
  findById(id: string): Promise<MediaReservationRecord | undefined>;
  /**
   * Atomically claims the pending -> validated|failed transition. A single-row
   * conditional UPDATE is sufficient here (unlike reserveIfUnderQuota's cross-row
   * aggregate check) — ordinary Postgres row-level locking makes the WHERE
   * status='pending' claim atomic on its own, no advisory lock needed. Zero rows
   * affected means a concurrent call already settled it; the caller should read
   * and return that instead of re-running checks.
   */
  claimValidationOutcome(id: string, outcome: ValidationOutcome): Promise<ClaimValidationOutcomeResult>;
}

/** Namespaces this feature's advisory locks so they can't collide with another feature's. */
const advisoryLockNamespace = sql`hashtext('media_reservation_quota')`;

export function createDrizzleMediaReservationRepository(db: DayliDatabase): MediaReservationRepository {
  return {
    async reserveIfUnderQuota(ownerId, maxPending, now, record) {
      return db.transaction(async (tx) => {
        // Transaction-scoped: released automatically on commit or rollback.
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
    async claimValidationOutcome(id, outcome) {
      const [claimed] = await db
        .update(schema.mediaReservation)
        .set({ status: outcome.status, failureReason: outcome.failureReason, validatedAt: outcome.validatedAt })
        .where(and(eq(schema.mediaReservation.id, id), eq(schema.mediaReservation.status, "pending")))
        .returning();
      if (claimed) return { outcome: "claimed", record: claimed };

      const [current] = await db
        .select()
        .from(schema.mediaReservation)
        .where(eq(schema.mediaReservation.id, id))
        .limit(1);
      return { outcome: "already_settled", record: current };
    },
  };
}
