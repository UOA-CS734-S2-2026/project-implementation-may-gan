import { FetchError, PostsApi, ResponseError, type PostDetail, type PostMedia, type ProfilePost, type ProfilePostsPage } from "@dayli/api-client";
import { apiConfiguration } from "@/lib/api/config";

export type { PostDetail, PostMedia, ProfilePost, ProfilePostsPage };

export type PostFailure = "unauthenticated" | "notFound" | "network" | "unavailable";
export type PostResult<T> = { ok: true; value: T } | { ok: false; failure: PostFailure };

async function toFailure(error: unknown): Promise<PostFailure> {
  if (error instanceof ResponseError) {
    if (error.response.status === 401) return "unauthenticated";
    // 404 covers both a missing post and one the viewer may not read; 422 is
    // an ID that could never exist.
    if (error.response.status === 404 || error.response.status === 422) return "notFound";
    return "unavailable";
  }
  if (error instanceof FetchError || error instanceof TypeError) return "network";
  return "unavailable";
}

/** The generated OpenAPI client owns the transport; this only maps failures for the UI. */
export const postsApi = {
  async get(postId: string): Promise<PostResult<PostDetail>> {
    const configuration = apiConfiguration();
    if (!configuration) return { ok: false, failure: "unavailable" };
    try {
      return { ok: true, value: await new PostsApi(configuration).postsGet({ postId }) };
    } catch (error) {
      return { ok: false, failure: await toFailure(error) };
    }
  },

  /** A fresh download URL for one attachment whose earlier URL expired. */
  async media(postId: string, mediaId: string): Promise<PostResult<PostMedia>> {
    const configuration = apiConfiguration();
    if (!configuration) return { ok: false, failure: "unavailable" };
    try {
      return { ok: true, value: await new PostsApi(configuration).postsGetMedia({ postId, mediaId }) };
    } catch (error) {
      return { ok: false, failure: await toFailure(error) };
    }
  },

  /** 404 is an unknown or blocked profile; a profile you may not read posts on is an empty page. */
  async profilePage(username: string, cursor?: string): Promise<PostResult<ProfilePostsPage>> {
    const configuration = apiConfiguration();
    if (!configuration) return { ok: false, failure: "unavailable" };
    try {
      return {
        ok: true,
        value: await new PostsApi(configuration).postsListProfilePosts(cursor ? { username, cursor } : { username }),
      };
    } catch (error) {
      return { ok: false, failure: await toFailure(error) };
    }
  },
};
