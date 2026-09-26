import type { MediaReservationRecord } from "./reserve/repository";
import type { MediaReservationResponse } from "./reserve/contract";

export type ClientMediaReservationStatus = "pending" | "expired" | "validated" | "failed";

/**
 * "expired" is derived, never stored — validated/failed are terminal and are never
 * overridden by TTL (the bytes at an object key don't change after they're checked,
 * so there is nothing left to "expire").
 */
export function deriveMediaReservationStatus(
  record: Pick<MediaReservationRecord, "status" | "expiresAt">,
  now: Date,
): ClientMediaReservationStatus {
  if (record.status === "pending" && record.expiresAt.getTime() <= now.getTime()) return "expired";
  return record.status;
}

/** Shared rendering so GET and complete return an identically-shaped reservation. */
export function toMediaReservationResponse(
  record: MediaReservationRecord,
  now: Date,
): MediaReservationResponse {
  return {
    id: record.id,
    contentType: record.contentType as MediaReservationResponse["contentType"],
    byteSize: record.byteSize,
    status: deriveMediaReservationStatus(record, now),
    failureReason: record.failureReason ?? undefined,
    createdAt: record.createdAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
    validatedAt: record.validatedAt ? record.validatedAt.toISOString() : undefined,
  };
}
