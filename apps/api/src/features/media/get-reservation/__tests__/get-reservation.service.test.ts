import { describe, expect, it } from "vitest";
import { createFakeMediaReservationRepository } from "../../shared/media-reservation.repository.fake";
import { getMediaReservation } from "../get-reservation.service";

const now = new Date("2026-10-01T00:00:00.000Z");
const record = {
  id: "media_test", ownerId: "owner", objectKey: "media/owner/media_test", contentType: "image/jpeg", byteSize: 10,
  status: "pending" as const, failureReason: null, validatedAt: null,
  createdAt: new Date(now.getTime() - 1_000), expiresAt: new Date(now.getTime() + 60_000),
};

describe("getMediaReservation — claimed by cleanup", () => {
  it("reports a live upload as expired once cleanup has claimed it", async () => {
    const repository = createFakeMediaReservationRepository();
    repository.records.set(record.id, { ...record, cleanupClaimedAt: now });
    const result = await getMediaReservation({ repository, clock: () => now }, "owner", record.id);
    expect(result).toMatchObject({ outcome: "found", reservation: { status: "expired" } });
  });

  it("still reports an unclaimed live upload as pending", async () => {
    const repository = createFakeMediaReservationRepository();
    repository.records.set(record.id, record);
    const result = await getMediaReservation({ repository, clock: () => now }, "owner", record.id);
    expect(result).toMatchObject({ outcome: "found", reservation: { status: "pending" } });
  });
});
