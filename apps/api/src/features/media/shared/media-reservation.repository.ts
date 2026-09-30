import { and, count, eq, gt, sql } from "drizzle-orm";
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
  | { outcome: "already_settled"; record: MediaReservationRecord | undefined }
  | { outcome: "expired" };

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
   * status='pending' claim atomic on its own, no advisory lock needed. The WHERE
   * also re-checks expiry against current time, evaluated fresh at claim time (not
   * whatever the caller checked before doing the slow R2 reads that precede this
   * call) — a reservation that lapses mid-completion must still be rejected as
   * expired, not silently validated/failed after its TTL is already gone.
   * Zero rows affected means either a concurrent call already settled it, or the
   * reservation expired since it was fetched; the caller should read the row to
   * tell which and return that instead of re-running checks.
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
        await tx
          .select({ locked: sql`pg_advisory_xact_lock(${advisoryLockNamespace}, hashtext(${ownerId}))` })
          .from(sql`(values (1)) as lock_source`);

        const [row] = await tx
          .select({ value: count() })
          .from(schema.mediaReservation)
          .where(
            and(
              eq(schema.mediaReservation.ownerId, ownerId),
              eq(schema.mediaReservation.status, "pending"),
              gt(schema.mediaReservation.expiresAt, now),
            ),
          );
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
        .where(
          and(
            eq(schema.mediaReservation.id, id),
            eq(schema.mediaReservation.status, "pending"),
            // Database time, not a value threaded in from the caller — the point is to
            // catch a reservation that lapses during the R2 reads this call follows.
            gt(schema.mediaReservation.expiresAt, sql`now()`),
          ),
        )
        .returning();
      if (claimed) return { outcome: "claimed", record: claimed };

      const [current] = await db
        .select()
        .from(schema.mediaReservation)
        .where(eq(schema.mediaReservation.id, id))
        .limit(1);
      // Still pending means the WHERE above failed only on the expiry check —
      // anyone who actually settled it would have moved it off "pending".
      if (current?.status === "pending") return { outcome: "expired" };
      return { outcome: "already_settled", record: current };
    },
  };
}
