import type { MediaReservationRecord, MediaReservationRepository } from "./repository";

/**
 * Shared in-memory fake, reused by reserve/route.test.ts and complete/route.test.ts.
 * No `await` between a check and its write anywhere here, so each method's body
 * runs as one synchronous tick — the fake's equivalent of the real repository's
 * transaction/row-lock, so concurrency-shaped tests behave the same way against both.
 */
export function createFakeMediaReservationRepository(): MediaReservationRepository & {
  records: Map<string, MediaReservationRecord>;
} {
  const records = new Map<string, MediaReservationRecord>();
  return {
    records,
    async reserveIfUnderQuota(ownerId, maxPending, now, record) {
      let count = 0;
      for (const existing of records.values()) {
        if (existing.ownerId === ownerId && existing.expiresAt.getTime() > now.getTime()) count += 1;
      }
      if (count >= maxPending) return "quota_exceeded";

      records.set(record.id, record);
      return "inserted";
    },
    async findById(id) {
      return records.get(id);
    },
    async claimValidationOutcome(id, outcome) {
      const current = records.get(id);
      if (!current || current.status !== "pending") {
        return { outcome: "already_settled", record: current };
      }

      const claimed: MediaReservationRecord = {
        ...current,
        status: outcome.status,
        failureReason: outcome.failureReason,
        validatedAt: outcome.validatedAt,
      };
      records.set(id, claimed);
      return { outcome: "claimed", record: claimed };
    },
  };
}
