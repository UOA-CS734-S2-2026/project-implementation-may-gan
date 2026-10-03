import {
  FetchError,
  InteractionsApi,
  ResponseError,
  type PostComment,
  type PostCommentsPage,
  type PostLike,
  type PostLikesPage,
  type PostLikeSummary,
} from "@dayli/api-client";
import { apiConfiguration } from "@/lib/api/config";

export type { PostComment, PostCommentsPage, PostLike, PostLikesPage, PostLikeSummary };

export type InteractionFailure = "unauthenticated" | "notFound" | "conflict" | "invalid" | "network" | "unavailable";
export type InteractionResult<T> = { ok: true; value: T } | { ok: false; failure: InteractionFailure };

function toFailure(error: unknown): InteractionFailure {
  if (error instanceof ResponseError) {
    const status = error.response.status;
    if (status === 401) return "unauthenticated";
    if (status === 404) return "notFound";
    if (status === 409) return "conflict";
    if (status === 422) return "invalid";
    return "unavailable";
  }
  if (error instanceof FetchError || error instanceof TypeError) return "network";
  return "unavailable";
}

async function call<T>(request: (api: InteractionsApi) => Promise<T>): Promise<InteractionResult<T>> {
  const configuration = apiConfiguration();
  if (!configuration) return { ok: false, failure: "unavailable" };
  try {
    return { ok: true, value: await request(new InteractionsApi(configuration)) };
  } catch (error) {
    return { ok: false, failure: toFailure(error) };
  }
}

/** The generated OpenAPI client owns the transport; this only maps failures for the UI. */
export const interactionsApi = {
  setLike: (postId: string, liked: boolean) =>
    call((api) => (liked ? api.interactionsLike({ postId }) : api.interactionsUnlike({ postId }))),
  likes: (postId: string, cursor?: string) =>
    call((api) => api.interactionsListLikes(cursor ? { postId, cursor } : { postId })),
  comments: (postId: string, cursor?: string) =>
    call((api) => api.interactionsListComments(cursor ? { postId, cursor } : { postId })),
  createComment: (postId: string, request: { clientCommentId: string; text: string; parentCommentId?: string }) =>
    call((api) => api.interactionsCreateComment({ postId, createPostCommentRequest: request })),
  updateComment: (postId: string, commentId: string, text: string) =>
    call((api) => api.interactionsUpdateComment({ postId, commentId, updatePostCommentRequest: { text } })),
  deleteComment: (postId: string, commentId: string) =>
    call((api) => api.interactionsDeleteComment({ postId, commentId })),
};

/** Failures reject, so TanStack Query never caches a failed read as data. */
export class InteractionApiError extends Error {
  constructor(public readonly failure: InteractionFailure) {
    super(`The interaction failed (${failure}).`);
    this.name = "InteractionApiError";
  }
}

export function unwrapInteraction<T>(result: InteractionResult<T>): T {
  if (!result.ok) throw new InteractionApiError(result.failure);
  return result.value;
}

export const interactionKeys = {
  likes: (userId: string, postId: string) => ["posts", userId, "likes", postId] as const,
  comments: (userId: string, postId: string) => ["posts", userId, "comments", postId] as const,
  /** Comments posted on this screen, kept outside the pages until paging reaches them. */
  created: (userId: string, postId: string) => ["interactions", userId, "created-comments", postId] as const,
} as const;
