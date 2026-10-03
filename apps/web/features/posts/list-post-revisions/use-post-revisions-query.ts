import { useInfiniteQuery } from "@tanstack/react-query";
import { postsApi } from "@/features/posts/shared/posts.api";
import { postKeys } from "@/features/posts/shared/posts.keys";
import { unwrapPostResult } from "@/features/posts/shared/query-result";
import { useSession } from "@/lib/session/hooks";

/** Earlier versions of a post, newest first, loaded only once they are opened. */
export function usePostRevisionsQuery(postId: string, enabled: boolean) {
  const { user } = useSession();
  const userId = user?.id ?? "anonymous";
  return useInfiniteQuery({
    queryKey: postKeys.revisions(userId, postId),
    enabled: enabled && Boolean(user?.id),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => unwrapPostResult(await postsApi.revisions(postId, pageParam)),
    getNextPageParam: (page) => (page.hasMore ? page.nextCursor ?? undefined : undefined),
    retry: false,
  });
}
