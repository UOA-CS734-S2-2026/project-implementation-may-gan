import { type InfiniteData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  interactionKeys,
  interactionsApi,
  unwrapInteraction,
  type PostComment,
  type PostCommentsPage,
} from "@/features/interactions/shared/interactions.api";
import { postsApi, type PostDetail } from "@/features/posts/shared/posts.api";
import { postKeys } from "@/features/posts/shared/posts.keys";
import { useSession } from "@/lib/session/hooks";

type CommentPages = InfiniteData<CommentsPage, string | undefined>;

/** A page the server refused because the viewer's access to the post is gone. */
export type CommentsPage = PostCommentsPage & { unavailable?: true };

/**
 * Comments and replies in the order they were written. A 404 returns an empty
 * "unavailable" page instead of throwing, which replaces the pages already
 * loaded, and it clears the comments posted on this screen too, so nothing
 * from before the access was revoked stays in the cache.
 */
export function useCommentsQuery(postId: string) {
  const { user } = useSession();
  const client = useQueryClient();
  const userId = user?.id ?? "anonymous";
  return useInfiniteQuery({
    queryKey: interactionKeys.comments(userId, postId),
    enabled: Boolean(user?.id),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }): Promise<CommentsPage> => {
      const result = await interactionsApi.comments(postId, pageParam);
      if (!result.ok && result.failure === "notFound") {
        client.setQueryData<PostComment[]>(interactionKeys.created(userId, postId), []);
        return { items: [], nextCursor: null, hasMore: false, unavailable: true };
      }
      return unwrapInteraction(result);
    },
    getNextPageParam: (page) => (page.hasMore ? page.nextCursor ?? undefined : undefined),
    retry: false,
  });
}

/**
 * Comments posted here. A new comment belongs after every older one, so while
 * older pages are unloaded it can't go into the pages without breaking their
 * order. It is shown from here until paging reaches it.
 */
export function useCreatedComments(postId: string) {
  const { user } = useSession();
  const client = useQueryClient();
  const key = interactionKeys.created(user?.id ?? "anonymous", postId);
  return useQuery({
    queryKey: key,
    queryFn: () => client.getQueryData<PostComment[]>(key) ?? [],
    initialData: [] as PostComment[],
    staleTime: Infinity,
  }).data;
}

/** The newest count read per post detail key, so an older answer can't overwrite a newer one. */
const countReads = new Map<string, number>();

/** Keeps the loaded comment pages, comments posted here, and the post's comment count in step after a change. */
function useCommentCache(postId: string) {
  const { user } = useSession();
  const client = useQueryClient();
  const userId = user?.id ?? "anonymous";
  const commentsKey = interactionKeys.comments(userId, postId);
  const createdKey = interactionKeys.created(userId, postId);
  const detailKey = postKeys.detail(userId, postId);

  return {
    has: (commentId: string) => [
      ...(client.getQueryData<CommentPages>(commentsKey)?.pages.flatMap((page) => page.items) ?? []),
      ...(client.getQueryData<PostComment[]>(createdKey) ?? []),
    ].some((item) => item.id === commentId),
    add: (comment: PostComment) => client.setQueryData<PostComment[]>(createdKey, (items = []) => [...items, comment]),
    edit: (change: (items: PostComment[]) => PostComment[]) => {
      client.setQueryData<CommentPages>(commentsKey, (data) => data && {
        ...data,
        pages: data.pages.map((page) => ({ ...page, items: change(page.items) })),
      });
      client.setQueryData<PostComment[]>(createdKey, (items) => items && change(items));
    },
    adjustCount: (delta: number) =>
      client.setQueryData<PostDetail>(detailKey, (post) => post && { ...post, commentCount: Math.max(0, post.commentCount + delta) }),
    /**
     * The server's count also covers comments on pages that aren't loaded.
     * Only the count is taken from the read: refetching the whole post could
     * land after a like and put back a stale like state. A 404 reloads the
     * post so the screen shows that it is gone.
     */
    refreshCount: async () => {
      const readKey = JSON.stringify(detailKey);
      const read = (countReads.get(readKey) ?? 0) + 1;
      countReads.set(readKey, read);
      const result = await postsApi.get(postId);
      if (countReads.get(readKey) !== read) return;
      if (result.ok) {
        client.setQueryData<PostDetail>(detailKey, (post) => post && { ...post, commentCount: result.value.commentCount });
      } else if (result.failure === "notFound") {
        await client.invalidateQueries({ queryKey: detailKey });
      }
    },
  };
}

/**
 * Posts a comment or reply. The caller keeps one clientCommentId per draft
 * and reuses it on retry, so a retry after a lost response never posts twice.
 */
export function useCreateComment(postId: string) {
  const cache = useCommentCache(postId);
  return useMutation({
    mutationFn: async (request: { clientCommentId: string; text: string; parentCommentId?: string }) =>
      unwrapInteraction(await interactionsApi.createComment(postId, request)),
    onSuccess: (comment) => {
      // A retry whose first attempt was saved returns the comment already shown.
      if (cache.has(comment.id)) return;
      cache.add(comment);
      cache.adjustCount(1);
      void cache.refreshCount();
    },
  });
}

export function useUpdateComment(postId: string) {
  const cache = useCommentCache(postId);
  return useMutation({
    mutationFn: async ({ commentId, text }: { commentId: string; text: string }) =>
      unwrapInteraction(await interactionsApi.updateComment(postId, commentId, text)),
    onSuccess: (comment) => cache.edit((items) => items.map((item) => (item.id === comment.id ? comment : item))),
  });
}

/** Deleting a top-level comment also removes its replies from view, as the server does. */
export function useDeleteComment(postId: string) {
  const cache = useCommentCache(postId);
  return useMutation({
    mutationFn: async (commentId: string) => unwrapInteraction(await interactionsApi.deleteComment(postId, commentId)),
    onSuccess: (_result, commentId) => {
      cache.edit((items) => items.filter((item) => item.id !== commentId && item.parentCommentId !== commentId));
      // Replies on unloaded pages disappear too, so only the server knows the new count.
      void cache.refreshCount();
    },
  });
}
