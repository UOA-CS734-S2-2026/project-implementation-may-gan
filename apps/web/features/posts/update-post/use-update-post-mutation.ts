import { useMutation, useQueryClient } from "@tanstack/react-query";
import { feedKeys } from "@/features/feed/shared/feed.keys";
import { postsApi, type UpdatePostRequest } from "@/features/posts/shared/posts.api";
import { postKeys } from "@/features/posts/shared/posts.keys";
import { unwrapPostResult } from "@/features/posts/shared/query-result";
import { useSession } from "@/lib/session/hooks";

/** Saves an edit to your own post and refreshes everywhere it is shown. */
export function useUpdatePostMutation(postId: string) {
  const { user } = useSession();
  const client = useQueryClient();
  const userId = user?.id ?? "anonymous";
  return useMutation({
    mutationFn: async (changes: UpdatePostRequest) => unwrapPostResult(await postsApi.update(postId, changes)),
    onSuccess: (post) => {
      client.setQueryData(postKeys.detail(userId, postId), post);
      void client.invalidateQueries({ queryKey: postKeys.all(userId) });
      void client.invalidateQueries({ queryKey: feedKeys.list(userId) });
    },
  });
}
