import type { FeedFailure, FeedResult } from "./feed.api";

/** Failures reject, so TanStack Query never caches a failed page as data. */
export class FeedApiError extends Error {
  constructor(public readonly failure: FeedFailure) {
    super(`The feed could not be loaded (${failure}).`);
    this.name = "FeedApiError";
  }
}

export function unwrapFeedResult<T>(result: FeedResult<T>): T {
  if (!result.ok) throw new FeedApiError(result.failure);
  return result.value;
}
