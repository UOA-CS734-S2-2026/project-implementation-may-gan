import { MAX_PENDING_RESERVATIONS_PER_OWNER, RESERVATION_TTL_SECONDS } from "../shared/media-reservation-policy";
import { createPresignedUploadUrl, type R2RuntimeConfiguration } from "../../../infrastructure/media/r2";
import { toMediaReservationResponse } from "../reservation-status";
import type {
  CreateMediaReservationRequest,
  CreateMediaReservationResponse,
  MediaReservationResponse,
} from "./reserve-upload.contract";
import type { MediaReservationRepository } from "./reserve-upload.repository";

export interface CreateMediaReservationDependencies {
  repository: MediaReservationRepository;
  r2: R2RuntimeConfiguration;
  clock?: () => Date;
  generateId?: () => string;
}

export type CreateMediaReservationResult =
  | { outcome: "created"; reservation: CreateMediaReservationResponse }
  | { outcome: "quota_exceeded" };

function defaultGenerateId(): string {
  return `media_${crypto.randomUUID()}`;
}

export async function createMediaReservation(
  deps: CreateMediaReservationDependencies,
  ownerId: string,
  request: CreateMediaReservationRequest,
): Promise<CreateMediaReservationResult> {
  const now = (deps.clock ?? (() => new Date()))();
  const id = (deps.generateId ?? defaultGenerateId)();
  const objectKey = `media/${ownerId}/${id}`;
  const expiresAt = new Date(now.getTime() + RESERVATION_TTL_SECONDS * 1000);

  // Presigning is a pure local computation (no DB/R2 network call), so it's safe to
  // do before the transaction. If the quota check below rejects, it is simply
  // discarded; nothing was persisted or uploaded, so there is nothing to clean up.
  
  const upload = await createPresignedUploadUrl(deps.r2, {
    objectKey,
    contentType: request.contentType,
    byteSize: request.byteSize,
    expiresInSeconds: RESERVATION_TTL_SECONDS,
    now,
  });

  const outcome = await deps.repository.reserveIfUnderQuota(ownerId, MAX_PENDING_RESERVATIONS_PER_OWNER, now, {
    id,
    ownerId,
    objectKey,
    contentType: request.contentType,
    byteSize: request.byteSize,
    status: "pending",
    failureReason: null,
    validatedAt: null,
    createdAt: now,
    expiresAt,
  });
  if (outcome === "quota_exceeded") {
    return { outcome: "quota_exceeded" };
  }

  return {
    outcome: "created",
    reservation: {
      id,
      contentType: request.contentType,
      byteSize: request.byteSize,
      status: "pending",
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      upload,
    },
  };
}

export interface GetMediaReservationDependencies {
  repository: MediaReservationRepository;
  clock?: () => Date;
}

export type GetMediaReservationResult =
  | { outcome: "found"; reservation: MediaReservationResponse }
  | { outcome: "not_found" };

export async function getMediaReservation(
  deps: GetMediaReservationDependencies,
  ownerId: string,
  id: string,
): Promise<GetMediaReservationResult> {
  const now = (deps.clock ?? (() => new Date()))();
  const record = await deps.repository.findById(id);
  if (!record || record.ownerId !== ownerId) {
    return { outcome: "not_found" };
  }

  return { outcome: "found", reservation: toMediaReservationResponse(record, now) };
}
