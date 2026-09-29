import type { PostFailure, PostResult } from "./posts.api";

/** Failures reject, so TanStack Query never caches a failed read as data. */
export class PostApiError extends Error {
  constructor(public readonly failure: PostFailure) {
    super(`The post could not be loaded (${failure}).`);
    this.name = "PostApiError";
  }
}

export function unwrapPostResult<T>(result: PostResult<T>): T {
  if (!result.ok) throw new PostApiError(result.failure);
  return result.value;
}
