import { describe, expect, it } from "vitest";
import { createFakeR2Reader } from "../../../infrastructure/media/r2.fake";
import { validJpegBytes } from "../../../infrastructure/media/media-format.fixtures";
import { createFakeMediaReservationRepository } from "../shared/media-reservation.repository.fake";
import type { MediaReservationRecord } from "../shared/media-reservation.repository";
import { completeMediaReservation } from "./complete.service";

const ownerId = "user_owner";
const objectKey = "media/user_owner/media_test";

function pendingRecord(overrides: Partial<MediaReservationRecord> = {}): MediaReservationRecord {
  return {
    id: "media_test",
    ownerId,
    objectKey,
    contentType: "image/jpeg",
    byteSize: validJpegBytes.byteLength,
    status: "pending",
    failureReason: null,
    validatedAt: null,
    createdAt: new Date(Date.now() - 1000),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    ...overrides,
  };
}

describe("completeMediaReservation — TTL race between the pre-check and the claim", () => {
  it("returns expired, and leaves the row pending, when the TTL lapses after the cheap pre-check but before the claim", async () => {
    const repository = createFakeMediaReservationRepository();
    // Already lapsed in real wall-clock time — stands in for the TTL expiring
    // while this call's R2 reads (fake and instantaneous here) were in flight.
    const record = pendingRecord({ expiresAt: new Date(Date.now() - 1) });
    repository.records.set(record.id, record);

    const r2Reader = createFakeR2Reader(new Map([[objectKey, validJpegBytes]]));

    const result = await completeMediaReservation(
      {
        repository,
        r2Reader,
        // Deliberately stale relative to the record's real expiresAt, so the
        // service's own cheap pre-check passes — exactly the race being closed:
        // a "now" captured before the R2 reads can't be trusted by the claim.
        clock: () => new Date(record.expiresAt.getTime() - 1000),
      },
      ownerId,
      record.id,
    );

    expect(result).toEqual({ outcome: "expired" });
    expect(repository.records.get(record.id)!.status).toBe("pending");
  });

  it("still validates normally when the TTL has not lapsed by claim time", async () => {
    const repository = createFakeMediaReservationRepository();
    const record = pendingRecord();
    repository.records.set(record.id, record);

    const r2Reader = createFakeR2Reader(new Map([[objectKey, validJpegBytes]]));

    const result = await completeMediaReservation({ repository, r2Reader }, ownerId, record.id);

    expect(result).toMatchObject({ outcome: "settled", reservation: { status: "validated" } });
    expect(repository.records.get(record.id)!.status).toBe("validated");
  });
});
