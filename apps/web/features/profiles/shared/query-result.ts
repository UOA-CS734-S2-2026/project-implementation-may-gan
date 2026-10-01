import type { ProfileFailure, ProfileResult } from "./profiles.api";

/** Failures reject, so TanStack Query never caches a failed read as data. */
export class ProfileApiError extends Error {
  constructor(public readonly failure: ProfileFailure) {
    super(`The profile request failed (${failure.kind}).`);
    this.name = "ProfileApiError";
  }
}

export function unwrapProfileResult<T>(result: ProfileResult<T>): T {
  if (!result.ok) throw new ProfileApiError(result.failure);
  return result.value;
}

/** Words for a failed save, shown next to the form. */
export function profileSaveMessage(failure: ProfileFailure): string {
  switch (failure.kind) {
    case "taken":
      return "That username is already taken.";
    case "tooSoon":
      return `You can change your username again on ${new Intl.DateTimeFormat("en-NZ", { dateStyle: "long", timeZone: "Pacific/Auckland" }).format(new Date(failure.availableAt))}.`;
    case "invalid":
      return "Check the highlighted field and try again.";
    case "network":
      return "You seem to be offline. Try again.";
    case "needsUsername":
      return "Choose a username first.";
    case "photoRejected":
      return "That photo couldn't be used. Try a JPEG, PNG, or WebP image under 10 MB.";
    default:
      return "That couldn't be saved. Try again.";
  }
}
