import { FetchError, ProfileApi, ResponseError, type ChangeUsernameResponse, type ProfileDetails, type ProfileVisibility } from "@dayli/api-client";
import { apiConfiguration } from "@/lib/api/config";

export type { ChangeUsernameResponse, ProfileDetails, ProfileVisibility };

export type ProfileFailure =
  | { kind: "unauthenticated" | "notFound" | "network" | "unavailable" | "invalid" }
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
};
