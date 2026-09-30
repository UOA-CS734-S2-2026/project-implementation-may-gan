import { FetchError, PostsApi, ResponseError, type FeedPage, type FeedPost } from "@dayli/api-client";
import { apiConfiguration } from "@/lib/api/config";

export type { FeedPage, FeedPost };

export type FeedFailure = "unauthenticated" | "network" | "unavailable" | "invalid";
export type FeedResult<T> = { ok: true; value: T } | { ok: false; failure: FeedFailure };

async function toFailure(error: unknown): Promise<FeedFailure> {
  if (error instanceof ResponseError) {
    if (error.response.status === 401) return "unauthenticated";
    if (error.response.status === 422) return "invalid";
    return "unavailable";
  }
  if (error instanceof FetchError || error instanceof TypeError) return "network";
  return "unavailable";
}

/** The generated OpenAPI client owns the transport; this only maps failures for the UI. */
export const feedApi = {
  async page(cursor?: string): Promise<FeedResult<FeedPage>> {
    const configuration = apiConfiguration();
    if (!configuration) return { ok: false, failure: "unavailable" };
    try {
      return { ok: true, value: await new PostsApi(configuration).postsListFeed(cursor ? { cursor } : {}) };
    } catch (error) {
      return { ok: false, failure: await toFailure(error) };
    }
  },
};
