import { useMutation, useQueryClient } from "@tanstack/react-query";
import { interactionKeys, interactionsApi, unwrapInteraction } from "@/features/interactions/shared/interactions.api";
import type { PostDetail } from "@/features/posts/shared/posts.api";
import { postKeys } from "@/features/posts/shared/posts.keys";
import { useSession } from "@/lib/session/hooks";

/**
 * Likes or unlikes a post, showing the change at once and putting it back if
 * the server refuses. The server's count replaces the guess when it answers.
 */
export function useLikeMutation(postId: string) {
  const { user } = useSession();
  const client = useQueryClient();
  const userId = user?.id ?? "anonymous";
  const detailKey = postKeys.detail(userId, postId);
  return useMutation({
    mutationFn: async (liked: boolean) => unwrapInteraction(await interactionsApi.setLike(postId, liked)),
    onMutate: async (liked) => {
      await client.cancelQueries({ queryKey: detailKey });
      const previous = client.getQueryData<PostDetail>(detailKey);
      if (previous && previous.viewerHasLiked !== liked) {
        client.setQueryData<PostDetail>(detailKey, {
          ...previous,
          viewerHasLiked: liked,
          likeCount: Math.max(0, previous.likeCount + (liked ? 1 : -1)),
        });
      }
      return { previous };
    },
    onError: (_error, _liked, context) => {
      if (context?.previous) client.setQueryData(detailKey, context.previous);
    },
    onSuccess: (summary) => {
      client.setQueryData<PostDetail>(detailKey, (post) => (post ? { ...post, ...summary } : post));
      void client.invalidateQueries({ queryKey: interactionKeys.likes(userId, postId) });
    },
  });
}
