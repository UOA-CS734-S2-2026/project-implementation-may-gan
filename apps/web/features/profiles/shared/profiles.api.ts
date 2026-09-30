import { FetchError, MediaApi, ProfileApi, ResponseError, type ChangeUsernameResponse, type ProfileDetails, type ProfileVisibility } from "@dayli/api-client";
import { apiConfiguration } from "@/lib/api/config";

export type { ChangeUsernameResponse, ProfileDetails, ProfileVisibility };

export type ProfileFailure =
  | { kind: "unauthenticated" | "notFound" | "network" | "unavailable" | "invalid" }
  | { kind: "photoRejected" }
  | { kind: "taken" }
  | { kind: "tooSoon"; availableAt: string }
  | { kind: "needsUsername" };
export type ProfileResult<T> = { ok: true; value: T } | { ok: false; failure: ProfileFailure };

export type ProfileUpdate = { bio?: string; publicName?: string; profileVisibility?: ProfileVisibility };

async function toFailure(error: unknown): Promise<ProfileFailure> {
  if (error instanceof ResponseError) {
    const status = error.response.status;
    if (status === 401) return { kind: "unauthenticated" };
    if (status === 404) return { kind: "notFound" };
    if (status === 422) return { kind: "invalid" };
    if (status === 409) {
      const body = await error.response.json().catch(() => null) as { error?: { details?: { reason?: unknown; availableAt?: unknown } } } | null;
      const details = body?.error?.details;
      if (details?.reason === "tooSoon" && typeof details.availableAt === "string") return { kind: "tooSoon", availableAt: details.availableAt };
      if (details?.reason === "taken") return { kind: "taken" };
      if (details?.reason === "notImage" || details?.reason === "notReady") return { kind: "photoRejected" };
      return { kind: "needsUsername" };
    }
    return { kind: "unavailable" };
  }
  if (error instanceof FetchError || error instanceof TypeError) return { kind: "network" };
  return { kind: "unavailable" };
}

async function call<T>(operation: (api: ProfileApi) => Promise<T>): Promise<ProfileResult<T>> {
  const configuration = apiConfiguration();
  if (!configuration) return { ok: false, failure: { kind: "unavailable" } };
  try {
    return { ok: true, value: await operation(new ProfileApi(configuration)) };
  } catch (error) {
    return { ok: false, failure: await toFailure(error) };
  }
}

/** The generated OpenAPI client owns the transport; this only maps failures for the UI. */
export const profilesApi = {
  details: (username: string) => call((api) => api.profileGetDetails({ username })),
  /** Blank text clears a field. */
  update: (changes: ProfileUpdate) => call((api) => api.profileUpdate({ updateProfileRequest: changes })),
  changeUsername: (username: string) => call((api) => api.profileChangeUsername({ changeUsernameRequest: { username } })),
  removeAvatar: () => call((api) => api.profileRemoveAvatar()),

  /**
   * Reserves an upload, sends the bytes straight to storage with the signed
   * headers, has the server check them, then uses the upload as the photo.
   */
  async uploadAvatar(file: File): Promise<ProfileResult<ProfileDetails>> {
    const configuration = apiConfiguration();
    if (!configuration) return { ok: false, failure: { kind: "unavailable" } };
    try {
      const media = new MediaApi(configuration);
      const reservation = await media.mediaReservationsCreate({
        createMediaReservationRequest: { contentType: file.type as never, byteSize: file.size },
      });
      // Browsers set content-length themselves and refuse to have it set.
      const headers = Object.fromEntries(
        Object.entries(reservation.upload.requiredHeaders).filter(([name]) => name.toLowerCase() !== "content-length"),
      );
      const put = await fetch(reservation.upload.url, { method: "PUT", headers, body: file });
      if (!put.ok && put.status !== 412) return { ok: false, failure: { kind: "unavailable" } };
      const checked = await media.mediaReservationsComplete({ id: reservation.id });
      if (checked.status !== "validated") return { ok: false, failure: { kind: "photoRejected" } };
      return { ok: true, value: await new ProfileApi(configuration).profileSetAvatar({ setAvatarRequest: { reservationId: reservation.id } }) };
    } catch (error) {
      return { ok: false, failure: await toFailure(error) };
    }
  },
};
