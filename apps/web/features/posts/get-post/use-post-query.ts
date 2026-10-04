import { useQuery } from "@tanstack/react-query";
import { postsApi } from "@/features/posts/shared/posts.api";
import { postKeys } from "@/features/posts/shared/posts.keys";
import { unwrapPostResult } from "@/features/posts/shared/query-result";
import { useSession } from "@/lib/session/hooks";

/** One post, keyed by account so a switch never shows another user's view. */
export function usePostQuery(postId: string) {
  const { user, isPending } = useSession();
  const userId = user?.id ?? "anonymous";
  return useQuery({
    queryKey: postKeys.detail(userId, postId),
    enabled: !isPending && Boolean(postId),
    queryFn: async () => unwrapPostResult(await postsApi.get(postId)),
    retry: false,
  });
}
