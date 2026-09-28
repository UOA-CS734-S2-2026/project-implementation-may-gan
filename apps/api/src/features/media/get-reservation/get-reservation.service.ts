import type { MediaReservationResponse } from "./get-reservation.contract";
import type { MediaReservationRepository } from "../shared/media-reservation.repository";

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
  if (!record || record.ownerId !== ownerId) return { outcome: "not_found" };

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
