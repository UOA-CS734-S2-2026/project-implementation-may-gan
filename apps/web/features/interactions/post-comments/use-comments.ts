import { type InfiniteData, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  interactionKeys,
  interactionsApi,
  unwrapInteraction,
  type PostComment,
  type PostCommentsPage,
} from "@/features/interactions/shared/interactions.api";
import type { PostDetail } from "@/features/posts/shared/posts.api";
import { postKeys } from "@/features/posts/shared/posts.keys";
import { useSession } from "@/lib/session/hooks";

type CommentPages = InfiniteData<PostCommentsPage, string | undefined>;

/** Comments and replies in the order they were written. */
export function useCommentsQuery(postId: string) {
  const { user } = useSession();
  const userId = user?.id ?? "anonymous";
  return useInfiniteQuery({
    queryKey: interactionKeys.comments(userId, postId),
    enabled: Boolean(user?.id),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => unwrapInteraction(await interactionsApi.comments(postId, pageParam)),
    getNextPageParam: (page) => (page.hasMore ? page.nextCursor ?? undefined : undefined),
    retry: false,
  });
}

/** Keeps the loaded comment pages and the post's comment count in step after a change. */
function useCommentCache(postId: string) {
  const { user } = useSession();
  const client = useQueryClient();
  const userId = user?.id ?? "anonymous";
  const commentsKey = interactionKeys.comments(userId, postId);
  const detailKey = postKeys.detail(userId, postId);

  return {
    loaded: () => client.getQueryData<CommentPages>(commentsKey)?.pages.flatMap((page) => page.items) ?? [],
    /** True when the last loaded page is the end of the list. */
    allLoaded: () => client.getQueryData<CommentPages>(commentsKey)?.pages.at(-1)?.hasMore === false,
    edit: (change: (items: PostComment[], isLastPage: boolean) => PostComment[]) =>
      client.setQueryData<CommentPages>(commentsKey, (data) => data && {
        ...data,
        pages: data.pages.map((page, index) => ({ ...page, items: change(page.items, index === data.pages.length - 1) })),
      }),
    adjustCount: (delta: number) =>
      client.setQueryData<PostDetail>(detailKey, (post) => post && { ...post, commentCount: Math.max(0, post.commentCount + delta) }),
    /** The server's count also covers comments on pages that aren't loaded. */
    refreshCount: () => client.invalidateQueries({ queryKey: detailKey }),
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
      if (cache.loaded().some((item) => item.id === comment.id)) return;
      // Pages are in writing order, so a new comment belongs at the very end.
      // While older pages are still unloaded, paging reaches it in order.
      if (cache.allLoaded()) cache.edit((items, isLastPage) => (isLastPage ? [...items, comment] : items));
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
