import { MAX_PENDING_RESERVATIONS_PER_OWNER, RESERVATION_TTL_SECONDS } from "../policy";
import { createPresignedUploadUrl, type R2RuntimeConfiguration } from "../../../lib/r2";
import type {
  CreateMediaReservationRequest,
  CreateMediaReservationResponse,
  MediaReservationResponse,
} from "./contract";
import type { MediaReservationRepository } from "./repository";

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
  const activeCount = await deps.repository.countActiveForOwner(ownerId, now);
  if (activeCount >= MAX_PENDING_RESERVATIONS_PER_OWNER) {
    return { outcome: "quota_exceeded" };
  }

  const id = (deps.generateId ?? defaultGenerateId)();
  const objectKey = `media/${ownerId}/${id}`;
  const expiresAt = new Date(now.getTime() + RESERVATION_TTL_SECONDS * 1000);

  const upload = await createPresignedUploadUrl(deps.r2, {
    objectKey,
    contentType: request.contentType,
    byteSize: request.byteSize,
    expiresInSeconds: RESERVATION_TTL_SECONDS,
    now,
  });

  await deps.repository.insert({
    id,
    ownerId,
    objectKey,
    contentType: request.contentType,
    byteSize: request.byteSize,
    createdAt: now,
    expiresAt,
  });

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

  return {
    outcome: "found",
    reservation: {
      id: record.id,
      contentType: record.contentType as MediaReservationResponse["contentType"],
      byteSize: record.byteSize,
      status: record.expiresAt.getTime() > now.getTime() ? "pending" : "expired",
      createdAt: record.createdAt.toISOString(),
      expiresAt: record.expiresAt.toISOString(),
    },
  };
}
