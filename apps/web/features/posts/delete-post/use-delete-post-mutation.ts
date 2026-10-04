import { useMutation, useQueryClient } from "@tanstack/react-query";
import { feedKeys } from "@/features/feed/shared/feed.keys";
import { postsApi } from "@/features/posts/shared/posts.api";
import { postKeys } from "@/features/posts/shared/posts.keys";
import { unwrapPostResult } from "@/features/posts/shared/query-result";
import { profileKeys } from "@/features/profiles/shared/profiles.keys";
import { useSession } from "@/lib/session/hooks";

/** Deletes your own post and drops it from every cached view. */
export function useDeletePostMutation(postId: string) {
  const { user } = useSession();
  const client = useQueryClient();
  const userId = user?.id ?? "anonymous";
  return useMutation({
    mutationFn: async () => unwrapPostResult(await postsApi.remove(postId)),
    onSuccess: () => {
      client.removeQueries({ queryKey: postKeys.detail(userId, postId) });
      client.removeQueries({ queryKey: postKeys.revisions(userId, postId) });
      void client.invalidateQueries({ queryKey: postKeys.all(userId) });
      void client.invalidateQueries({ queryKey: feedKeys.list(userId) });
      // The streak and post count on your profile change too.
      void client.invalidateQueries({ queryKey: profileKeys.all(userId) });
    },
  });
}
