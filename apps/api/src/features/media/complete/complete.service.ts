import {
  checkEssentialStructure,
  checkMagicBytes,
  extractIsoBmffDurationSeconds,
  readMagicByteWindow,
  type BoxSource,
} from "../../../infrastructure/media/media-format";
import type { MediaR2Reader } from "../../../infrastructure/media/r2";
import {
  isAudioContentType,
  MAX_VOICE_MEMO_SECONDS,
  MAX_VIDEO_DURATION_SECONDS,
  type AllowedContentType,
} from "../shared/media-reservation-policy";
import { toMediaReservationResponse } from "../shared/media-reservation-status";
import type { MediaReservationResponse } from "../shared/media-reservation.contract";
import type {
  MediaReservationRecord,
  MediaReservationRepository,
  MediaValidationFailureReason,
  ValidationOutcome,
} from "../shared/media-reservation.repository";

export interface CompleteMediaReservationDependencies {
  repository: MediaReservationRepository;
  r2Reader: MediaR2Reader;
  clock?: () => Date;
}

export type CompleteMediaReservationResult =
  | { outcome: "settled"; reservation: MediaReservationResponse }
  | { outcome: "not_found" }
  | { outcome: "expired" };

interface DeterminedValidation {
  status: "validated" | "failed";
  failureReason: MediaValidationFailureReason | null;
}

function isVideo(contentType: string): boolean {
  return contentType.startsWith("video/");
}

/**
 * Runs every R2-backed check for one reservation, entirely outside any database
 * transaction (docs/dayli/architecture.md: never hold a lock during R2 I/O).
 * Returns undefined when the object hasn't been uploaded yet — a transient,
 * retryable condition, not a failure — nothing should be persisted for it.
 */
async function determineValidation(
  reader: MediaR2Reader,
  record: MediaReservationRecord,
): Promise<DeterminedValidation | undefined> {
  const head = await reader.head(record.objectKey);
  if (head.outcome === "not_found") return undefined;

  if (head.contentLength !== record.byteSize) {
    return { status: "failed", failureReason: "byte_size_mismatch" };
  }

  // Shared across the magic-byte check and the duration walk below — both need
  // bounded ranged reads from the same object. A rare TOCTOU case (the object
  // existed at HEAD but vanished before a following read) is captured distinctly
  // from an ordinary malformed/truncated read via the `vanished` flag, since that
  // one case is terminal (object_not_found) rather than retryable.
  let vanished = false;
  const read = async (start: number, end: number): Promise<Uint8Array | undefined> => {
    const result = await reader.readRange(record.objectKey, { start, end });
    if (result.outcome === "not_found") {
      vanished = true;
      return undefined;
    }
    return result.outcome === "read" ? result.bytes : undefined;
  };

  const window = await readMagicByteWindow(read, head.contentLength);
  if (vanished) return { status: "failed", failureReason: "object_not_found" };
  if (!window) return { status: "failed", failureReason: "malformed_container" };
  if (checkMagicBytes(record.contentType as AllowedContentType, window) === "mismatch") {
    return { status: "failed", failureReason: "format_mismatch" };
  }

  const source: BoxSource = { fileSize: head.contentLength, readRange: read };

  // A correct leading marker alone isn't proof of a real file of that type — e.g.
  // arbitrary bytes starting with the JPEG SOI marker, or an ISO-BMFF file with no
  // actual track/media data. This checks each format's other load-bearing
  // structure before trusting the leading-bytes match above.
  if ((await checkEssentialStructure(record.contentType as AllowedContentType, window, source)) === "mismatch") {
    if (vanished) return { status: "failed", failureReason: "object_not_found" };
    return { status: "failed", failureReason: "malformed_container" };
  }

  const audio = isAudioContentType(record.contentType);
  if (!audio && !isVideo(record.contentType)) {
    return { status: "validated", failureReason: null };
  }

  // Audio and video share one box walk; audio reads its `soun` track and must hold no video.
  const duration = await extractIsoBmffDurationSeconds(source, undefined, audio ? "soun" : "vide");
  if (vanished) return { status: "failed", failureReason: "object_not_found" };
  if (duration.outcome === "malformed") return { status: "failed", failureReason: "malformed_container" };
  const maxSeconds = audio ? MAX_VOICE_MEMO_SECONDS : MAX_VIDEO_DURATION_SECONDS;
  if (duration.seconds > maxSeconds) {
    return { status: "failed", failureReason: "duration_exceeded" };
  }
  return { status: "validated", failureReason: null };
}

export async function completeMediaReservation(
  deps: CompleteMediaReservationDependencies,
  ownerId: string,
  id: string,
): Promise<CompleteMediaReservationResult> {
  const now = (deps.clock ?? (() => new Date()))();
  const record = await deps.repository.findById(id);
  // A claimed upload is being deleted, so it reads as gone, like a deleted row.
  if (!record || record.ownerId !== ownerId || record.cleanupClaimedAt) {
    return { outcome: "not_found" };
  }

  // Idempotent: a settled reservation's bytes don't change, so a repeat call
  // returns the stored outcome with zero R2 calls rather than re-checking.
  if (record.status !== "pending") {
    return { outcome: "settled", reservation: toMediaReservationResponse(record, now) };
  }

  // Cheap fast-fail before any R2 call: a reservation that expired without ever
  // completing is dead — a client that wants to fix it must reserve again.
  if (record.expiresAt.getTime() <= now.getTime()) {
    return { outcome: "expired" };
  }

  const validation = await determineValidation(deps.r2Reader, record);
  if (!validation) {
    // Not uploaded yet — nothing persisted, still pending, retryable until expiry.
    return { outcome: "settled", reservation: toMediaReservationResponse(record, now) };
  }

  const outcome: ValidationOutcome = { status: validation.status, failureReason: validation.failureReason, validatedAt: now };
  const claim = await deps.repository.claimValidationOutcome(id, outcome);
  // The reservation's TTL lapsed between the cheap check above and this claim —
  // e.g. while the R2 reads above were in flight — so it must not be settled.
  if (claim.outcome === "expired") return { outcome: "expired" };
  // claim.record is only absent if the row vanished between findById and here,
  // which only happens if cleanup deleted it in between.
  if (!claim.record) return { outcome: "not_found" };
  return { outcome: "settled", reservation: toMediaReservationResponse(claim.record, now) };
}
