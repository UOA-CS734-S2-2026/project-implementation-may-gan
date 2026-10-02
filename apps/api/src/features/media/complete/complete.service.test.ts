import { describe, expect, it } from "vitest";
import { createFakeR2Reader, createUnusedR2Reader } from "../../../infrastructure/media/r2.fake";
import {
  buildFtypBox,
  buildMinimalM4a,
  buildMinimalMp4,
  buildMoovBox,
  buildMvhdBoxV0,
  buildTrakBox,
  concatBoxes,
  validJpegBytes,
  wrapBox,
} from "../../../infrastructure/media/media-format.fixtures";
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

describe("completeMediaReservation — claimed by cleanup", () => {
  it("reads a tombstoned upload as gone, without reading R2 or settling it", async () => {
    const repository = createFakeMediaReservationRepository();
    const record = pendingRecord({ cleanupClaimedAt: new Date() });
    repository.records.set(record.id, record);

    const result = await completeMediaReservation(
      { repository, r2Reader: createFakeR2Reader(new Map([[objectKey, validJpegBytes]])) },
      ownerId,
      record.id,
    );

    expect(result).toEqual({ outcome: "not_found" });
    expect(repository.records.get(record.id)?.status).toBe("pending");
  });

  it("does not settle a pending upload cleanup claims during the R2 reads", async () => {
    const repository = createFakeMediaReservationRepository();
    const record = pendingRecord();
    repository.records.set(record.id, record);
    const reader = createFakeR2Reader(new Map([[objectKey, validJpegBytes]]));
    const claimingReader = {
      ...reader,
      head: async (key: string) => {
        repository.records.set(record.id, { ...record, cleanupClaimedAt: new Date() });
        return reader.head(key);
      },
    };

    const result = await completeMediaReservation({ repository, r2Reader: claimingReader }, ownerId, record.id);

    expect(result).toEqual({ outcome: "expired" });
    expect(repository.records.get(record.id)?.status).toBe("pending");
  });
});

describe("completeMediaReservation — voice memos", () => {
  async function completeAudio(bytes: Uint8Array, overrides: Partial<MediaReservationRecord> = {}) {
    const repository = createFakeMediaReservationRepository();
    const record = pendingRecord({ contentType: "audio/mp4", byteSize: bytes.byteLength, ...overrides });
    repository.records.set(record.id, record);
    const result = await completeMediaReservation(
      { repository, r2Reader: createFakeR2Reader(new Map([[objectKey, bytes]])) },
      ownerId,
      record.id,
    );
    return { result, repository, record };
  }

  it("validates a voice memo inside the limit", async () => {
    const { result } = await completeAudio(buildMinimalM4a(30));
    expect(result).toMatchObject({ outcome: "settled", reservation: { status: "validated" } });
  });

  it("validates a voice memo of exactly 60 seconds", async () => {
    const { result } = await completeAudio(buildMinimalM4a(60));
    expect(result).toMatchObject({ outcome: "settled", reservation: { status: "validated" } });
  });

  it("fails a voice memo over 60 seconds as duration_exceeded", async () => {
    const { result } = await completeAudio(buildMinimalM4a(60.5));
    expect(result).toMatchObject({
      outcome: "settled",
      reservation: { status: "failed", failureReason: "duration_exceeded" },
    });
  });

  it("fails a voice memo whose header understates its length only in the movie header", async () => {
    // mvhd claims 5 s while the audio track says 120 s: the two disagree, so no track is trusted.
    const file = concatBoxes(
      buildFtypBox("M4A ", ["M4A ", "isom"]),
      buildMoovBox([
        buildMvhdBoxV0({ timescale: 1000, duration: 5000 }),
        buildTrakBox({ timescale: 44_100, duration: 120 * 44_100, handlerType: "soun" }),
      ]),
      wrapBox("mdat", new Uint8Array([1, 2, 3])),
    );
    const { result } = await completeAudio(file);
    expect(result).toMatchObject({ reservation: { status: "failed", failureReason: "malformed_container" } });
  });

  it("fails a video declared as audio", async () => {
    const { result } = await completeAudio(buildMinimalMp4(5));
    expect(result).toMatchObject({ reservation: { status: "failed", failureReason: "malformed_container" } });
  });

  it("fails an audio file that also carries a video track", async () => {
    const file = concatBoxes(
      buildFtypBox("M4A ", ["M4A ", "isom"]),
      buildMoovBox([
        buildMvhdBoxV0({ timescale: 1000, duration: 5000 }),
        buildTrakBox({ timescale: 44_100, duration: 5 * 44_100, handlerType: "soun" }),
        buildTrakBox({ timescale: 1000, duration: 5000, handlerType: "vide" }),
      ]),
      wrapBox("mdat", new Uint8Array([1, 2, 3])),
    );
    const { result } = await completeAudio(file);
    expect(result).toMatchObject({ reservation: { status: "failed", failureReason: "malformed_container" } });
  });

  it("fails a forged declaration: a JPEG uploaded as audio/mp4", async () => {
    const { result } = await completeAudio(validJpegBytes);
    expect(result).toMatchObject({ reservation: { status: "failed", failureReason: "format_mismatch" } });
  });

  it("fails a QuickTime movie declared as audio/mp4", async () => {
    const quicktime = concatBoxes(
      buildFtypBox("qt  ", ["qt  "]),
      buildMoovBox([
        buildMvhdBoxV0({ timescale: 1000, duration: 5000 }),
        buildTrakBox({ timescale: 44_100, duration: 5 * 44_100, handlerType: "soun" }),
      ]),
      wrapBox("mdat", new Uint8Array([1, 2, 3])),
    );
    const { result } = await completeAudio(quicktime);
    expect(result).toMatchObject({ reservation: { status: "failed", failureReason: "format_mismatch" } });
  });

  it("fails random bytes and a truncated file safely, without provider details", async () => {
    const random = await completeAudio(new Uint8Array(512).map((_, index) => (index * 31) % 251));
    expect(random.result).toMatchObject({ reservation: { status: "failed", failureReason: "format_mismatch" } });

    const whole = buildMinimalM4a(5);
    const truncated = await completeAudio(whole.slice(0, whole.byteLength - 20));
    expect(truncated.result).toMatchObject({ reservation: { status: "failed", failureReason: "malformed_container" } });
    expect(JSON.stringify(truncated.result)).not.toContain(objectKey);
  });

  it("fails an upload whose size differs from the reserved size", async () => {
    const bytes = buildMinimalM4a(5);
    const { result } = await completeAudio(bytes, { byteSize: bytes.byteLength + 1 });
    expect(result).toMatchObject({ reservation: { status: "failed", failureReason: "byte_size_mismatch" } });
  });

  it("returns the stored outcome on a retry without reading R2 again", async () => {
    const bytes = buildMinimalM4a(60.5);
    const { repository, record } = await completeAudio(bytes);
    const retry = await completeMediaReservation(
      { repository, r2Reader: createUnusedR2Reader() },
      ownerId,
      record.id,
    );
    expect(retry).toMatchObject({ reservation: { status: "failed", failureReason: "duration_exceeded" } });
  });

  it("does not let another user complete the voice memo", async () => {
    const repository = createFakeMediaReservationRepository();
    const bytes = buildMinimalM4a(5);
    const record = pendingRecord({ contentType: "audio/mp4", byteSize: bytes.byteLength });
    repository.records.set(record.id, record);
    const result = await completeMediaReservation(
      { repository, r2Reader: createUnusedR2Reader() },
      "user_other",
      record.id,
    );
    expect(result).toEqual({ outcome: "not_found" });
  });
});
