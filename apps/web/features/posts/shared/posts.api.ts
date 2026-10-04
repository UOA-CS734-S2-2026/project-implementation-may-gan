import {
  FetchError,
  PostsApi,
  ResponseError,
  type PostAudience,
  type PostDetail,
  type PostMedia,
  type PostRevision,
  type PostRevisionsPage,
  type ProfilePost,
  type UpdatePostRequest,
} from "@dayli/api-client";
import { apiConfiguration } from "@/lib/api/config";

export type { PostAudience, PostDetail, PostMedia, PostRevision, PostRevisionsPage, ProfilePost, UpdatePostRequest };
export type ProfilePostsPage = {
  kind: "archive";
  items: ProfilePost[];
  nextCursor: string | null;
  hasMore: boolean;
};
export type ReadableProfilePosts = ProfilePostsPage | { kind: "restricted"; username: string };

export type PostFailure = "unauthenticated" | "notFound" | "conflict" | "invalid" | "network" | "unavailable";
export type PostResult<T> = { ok: true; value: T } | { ok: false; failure: PostFailure };

/** For a write, 422 is a field the server rejected rather than a bad ID. */
async function toFailure(error: unknown, writes = false): Promise<PostFailure> {
  if (error instanceof ResponseError) {
    if (error.response.status === 401) return "unauthenticated";
    // 404 covers both a missing post and one the viewer may not read; 422 is
    // an ID that could never exist.
    if (error.response.status === 404) return "notFound";
    if (error.response.status === 409) return "conflict";
    if (error.response.status === 422) return writes ? "invalid" : "notFound";
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

  /** Saves an edit by the author and returns the post as it is now. */
  async update(postId: string, changes: UpdatePostRequest): Promise<PostResult<PostDetail>> {
    const configuration = apiConfiguration();
    if (!configuration) return { ok: false, failure: "unavailable" };
    try {
      return { ok: true, value: await new PostsApi(configuration).postsUpdate({ postId, updatePostRequest: changes }) };
    } catch (error) {
      return { ok: false, failure: await toFailure(error, true) };
    }
  },

  /** Deletes the author's post by moving it to Trash; unavailable while Trash is switched off. */
  async remove(postId: string): Promise<PostResult<void>> {
    const configuration = apiConfiguration();
    if (!configuration) return { ok: false, failure: "unavailable" };
    try {
      await new PostsApi(configuration).postsTrash({ postId });
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, failure: await toFailure(error, true) };
    }
  },

  async revisions(postId: string, cursor?: string): Promise<PostResult<PostRevisionsPage>> {
    const configuration = apiConfiguration();
    if (!configuration) return { ok: false, failure: "unavailable" };
    try {
      return {
        ok: true,
        value: await new PostsApi(configuration).postsListRevisions(cursor ? { postId, cursor } : { postId }),
      };
    } catch (error) {
      return { ok: false, failure: await toFailure(error) };
    }
  },

  /** 404 is an unknown or blocked profile; a profile you may not read posts on is an empty page. */
  async profilePage(username: string, cursor?: string): Promise<PostResult<ReadableProfilePosts>> {
    const configuration = apiConfiguration();
    if (!configuration) return { ok: false, failure: "unavailable" };
    try {
      const page = await new PostsApi(configuration).postsListProfilePosts(
        cursor ? { username, cursor } : { username },
        { cache: "no-store" },
      );
      if (page.kind === "restricted" && typeof page.username === "string") {
        return { ok: true, value: { kind: "restricted", username: page.username } };
      }
      if (page.kind !== "archive" || !page.items || page.nextCursor === undefined || page.hasMore === undefined) {
        return { ok: false, failure: "unavailable" };
      }
      return {
        ok: true,
        value: { kind: "archive", items: page.items, nextCursor: page.nextCursor, hasMore: page.hasMore },
      };
    } catch (error) {
      return { ok: false, failure: await toFailure(error) };
    }
  },
};
